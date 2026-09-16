# Smart URL Intelligence Platform
## Phase 2 — Final Locked Architecture & Data Model Specification

---

## 1. Core Architecture Philosophy & Progressive Rules

We follow a strict learning and system-design rule:
$$\mathbf{BUILD\ SIMPLE} \longrightarrow \mathbf{IDENTIFY\ THE\ BOTTLENECK} \longrightarrow \mathbf{INTRODUCE\ THE\ NEXT\ COMPONENT\ ONLY\ WHEN\ JUSTIFIED}$$

Phase 2 establishes the simplest possible working architecture capable of satisfying our locked Phase 1 baseline scale ($10\text{M}$ creations/month, $1\text{B}$ redirects/month, 100:1 read-to-write ratio, P99 redirect latency $< 50\text{ms}$). Caching layers (Redis), message queues (Kafka), and container orchestrators (Kubernetes) are intentionally postponed until real performance bottlenecks are proven under load.

---

## 2. System Boundary

```
+-----------------------------------------------------------------------------------+
|                                SYSTEM BOUNDARY                                    |
+-----------------------------------------------------------------------------------+
|  EXTERNAL ACTORS                                                                  |
|  1. Developer (Link Creator)  : Accesses REST API via HTTP/HTTPS with API Key.    |
|  2. Visitor (End User)        : Accesses Short Link via Browser (Anonymous).      |
|                                                                                   |
|  IN SCOPE (V1 MVP)                                                                |
|  - API Gateway / Auth Middleware (Bearer Token Verification & Rate Limiting).     |
|  - Stateless Application Server (Write API + 302 Redirect Engine).                |
|  - Primary Relational Database (PostgreSQL: Mappings, Accounts, Click Counters).  |
|                                                                                   |
|  OUT OF SCOPE (Deferred)                                                          |
|  - Redis Cache, Kafka Queue, CDN Edge Scripting, Kubernetes, Threat Scanning.     |
+-----------------------------------------------------------------------------------+
```

---

## 3. MVP Architecture & Benchmark Targets

### Baseline Architecture: 3-Tier Stateless Monolith
$$\text{Client Browser / API Client} \longrightarrow \text{Load Balancer} \longrightarrow \text{Stateless Application Server} \longrightarrow \text{PostgreSQL Database}$$

### Capacity Assumptions & Measurable Targets (Un-benchmarked Assumptions)
* **Write Throughput Target (`[ASSUMPTION]`)**: Peak $38.6 \text{ writes/sec}$. A single modest database instance handling 38.6 inserts/second consumes minimal write I/O.
* **Read Throughput Target (`[ASSUMPTION]`)**: Peak $3,858 \text{ reads/sec}$. With an in-memory B-Tree index on `short_code` held in database RAM (`shared_buffers`), point-lookups execute in $< 0.5\text{ms}$.
* **Backend Latency SLA Target (`[BENCHMARK TARGET]`)**: App processing ($\approx 1\text{ms}$) + Database indexed read ($\approx 2-5\text{ms}$) = Total Execution Time $\approx 3-8\text{ms}$ (Well within P99 $< 50\text{ms}$ budget).

---

## 4. Component Responsibilities

### Component 1: Stateless Application Server
* **Responsibility**: Exposes REST API endpoints (`POST /api/v1/links`, `GET /s/:code`, etc.), verifies `SHA-256(api_key)` hashes, validates URL syntax, generates Base62 codes, executes HTTP 302 redirects, and dispatches best-effort background click counter updates.
* **Inputs**: HTTP requests (JSON payload for writes, GET query for redirects).
* **Outputs**: HTTP responses (JSON `201 Created` for writes, HTTP `302 Found` with `Location` header for redirects).
* **State Boundaries**: **Application instances do not store durable business state or user session state.** Per-instance API key rate-limiting buckets operate in application RAM as a non-durable defense. If an app instance restarts, its rate-limit memory resets.
* **Why it exists**: Serves as the central business logic and routing engine.

### Component 2: Primary Database (PostgreSQL Relational Store)
* **Responsibility**: Serves as the sole stateful source of truth for User Accounts, Short Link Mappings, and Atomic Click Counters.
* **Inputs**: SQL queries from Application Server via pooled connections.
* **Outputs**: Query results (Mapping tuples, User credentials).
* **State**: **Stateful Source of Truth**.
* **Why it exists**: Provides ACID transactional persistence for mappings and strong read-after-write consistency.

---

## 5. API Design (Contract Specification)

```
+-----------------------------------------------------------------------------------+
|                               API CONTRACT SUMMARY                                |
+-----------------------------------------------------------------------------------+
|  1. POST   /api/v1/links         : Create short URL (Auth required).              |
|  2. GET    /s/:code              : Public 302 Redirect (No Auth / Hot Path).     |
|  3. GET    /api/v1/links         : List developer's created links (Auth required).|
|  4. DELETE /api/v1/links/:code    : Deactivate short link (Auth required).         |
+-----------------------------------------------------------------------------------+
```

### 1. `POST /api/v1/links` — Create Short URL
* **Authentication**: `Authorization: Bearer <api_key>` (Verified against `SHA-256(api_key)` in DB).
* **Request Body**:
```json
{
  "target_url": "https://example.com/blog/system-design-guide?utm_source=twitter"
}
```
* **Success Response (`201 Created`)**:
```json
{
  "short_code": "aB3dE1",
  "short_url": "https://short.ly/s/aB3dE1",
  "target_url": "https://example.com/blog/system-design-guide?utm_source=twitter",
  "created_at": "2026-09-15T15:40:00Z"
}
```
* **Validation Error (`400 Bad Request`)**:
```json
{
  "error": "INVALID_URL",
  "message": "Target URL must use http:// or https:// scheme and not exceed 2048 characters."
}
```

### 2. `GET /s/:code` — Public Short Link Redirect (Hot Path)
* **Authentication**: **None (100% Public)**
* **Request**: `GET /s/aB3dE1`
* **Success Response (`302 Found`)**:
  * **HTTP Headers**:
    ```http
    HTTP/1.1 302 Found
    Location: https://example.com/blog/system-design-guide?utm_source=twitter
    Cache-Control: no-cache, no-store, must-revalidate
    Pragma: no-cache
    Expires: 0
    ```
* **Failure Response (`404 Not Found`)**: Short code does not exist.
* **Failure Response (`410 Gone`)**: Link has been deactivated (`is_active == false`).

### 3. `GET /api/v1/links` — List Creator's Links
* **Authentication**: `Authorization: Bearer <api_key>`
* **Query Parameters**: `?limit=20&offset=0` *(No `COUNT(*)` scan executed)*
* **Success Response (`200 OK`)**:
```json
{
  "links": [
    {
      "short_code": "aB3dE1",
      "short_url": "https://short.ly/s/aB3dE1",
      "target_url": "https://example.com/blog/system-design-guide",
      "click_count": 142,
      "is_active": true,
      "created_at": "2026-09-15T15:40:00Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "has_more": false
}
```
* **Note**: Limit/Offset without `total` count is selected for V1 to prevent expensive `COUNT(*)` database scans. Cursor-based pagination (`?limit=20&after_code=abc123`) is documented as a P1 scale improvement.

### 4. `DELETE /api/v1/links/:code` — Deactivate Short Link
* **Authentication**: `Authorization: Bearer <api_key>`
* **Success Response (`200 OK`)**:
```json
{
  "short_code": "aB3dE1",
  "status": "DEACTIVATED",
  "message": "Link has been successfully deactivated."
}
```

---

## 6. Request Flows (Sequence Breakdown)

### Flow A: Creating a Short URL
```
[ Client ] ---> POST /api/v1/links (Payload + API Key)
                     |
                     v
             [ App Server ]
                     |
                     +---> 1. Verify SHA-256(api_key) Hash
                     +---> 2. Enforce Rate Limit (60 req/min in memory)
                     +---> 3. Validate URL syntax (http/https, <= 2048 chars)
                     +---> 4. Generate random Base62 code (e.g. "aB3dE1")
                     +---> 5. Execute DB INSERT (short_code, target_url, user_id)
                     |
[ Client ] <--- Return 201 Created (JSON Payload)
```

### Flow B: Executing a Redirect (Hot Path - Zero DB Write Lock)
```
[ Visitor ] ---> GET /s/aB3dE1
                     |
                     v
             [ App Server ]
                     |
                     +---> 1. Execute DB SELECT (short_code = 'aB3dE1')
                     |        - If Not Found -> Return 404
                     |        - If is_active == false -> Return 410
                     |
                     +---> 2. IMMEDIATELY Dispatch HTTP 302 Found (Location: target_url)
                     |
                     +---> 3. [Non-Blocking Async Background Task]:
                              Execute SQL: UPDATE links SET click_count = click_count + 1
                              (Failure or process crash here NEVER delays or fails the redirect!)
```

---

## 7. Logical Data Model & Core Entities

```
+----------------------------------+       1 : N       +----------------------------------+
|           User Entity            | <---------------- |           Link Entity            |
+----------------------------------+                   +----------------------------------+
| user_id       : UUID (PK)        |                   | short_code    : VARCHAR(10) (PK) |
| api_key_hash  : VARCHAR(64) (UQ) |                   | target_url    : VARCHAR(2048)    |
| created_at    : TIMESTAMP        |                   | user_id       : UUID (FK)        |
+----------------------------------+                   | click_count   : BIGINT           |
                                                       | is_active     : BOOLEAN          |
                                                       | created_at    : TIMESTAMP        |
                                                       +----------------------------------+
```

### Entity 1: `User` (Developer Account)
* `user_id` (`UUID`, PK): Unique account identifier.
* `api_key_hash` (`VARCHAR(64)`, Unique Index): `SHA-256` cryptographic hash of the developer's API key. **Raw API keys are returned once at creation and NEVER stored in PostgreSQL.**
* `created_at` (`TIMESTAMP`): Account audit timestamp.

### Entity 2: `Link` (Core Mapping Record)
* `short_code` (`VARCHAR(10)`, **Primary Key**): Unique short string (e.g. `aB3dE1`). Primary key because redirects query `short_code`.
* `target_url` (`VARCHAR(2048)`, NOT NULL): Original destination URL.
* `user_id` (`UUID`, NOT NULL, FK $\rightarrow$ `User.user_id`): Ties link to owner.
* `click_count` (`BIGINT`, NOT NULL, Default `0`): Aggregate atomic click counter.
* `is_active` (`BOOLEAN`, NOT NULL, Default `true`): Soft-deletion flag.
* `created_at` (`TIMESTAMP`, NOT NULL): Link creation timestamp.

---

## 8. Database Access Patterns

| Access Pattern | SQL Query Type | Frequency (Peak Target) | Required Index | Consistency Guarantee |
| :--- | :--- | :--- | :--- | :--- |
| **Redirect Lookup** | `SELECT target_url, is_active FROM links WHERE short_code = ?` | **High (~3,858 req/sec)** | **PK Index on `short_code`** | Strong read-after-write |
| **Click Counter ++** | `UPDATE links SET click_count = click_count + 1 WHERE short_code = ?` | **Async Background Task** | **PK Index on `short_code`** | Best-Effort Eventual |
| **Create Link** | `INSERT INTO links (short_code, target_url, user_id, created_at)` | Low (~38.6 req/sec) | **PK Index on `short_code`** | Strong consistency (ACID) |
| **List User Links** | `SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?` | Low (< 5 req/sec) | **Composite Index (`user_id`, `created_at`)** | Read-after-write |
| **Deactivate Link** | `UPDATE links SET is_active = false WHERE short_code = ? AND user_id = ?` | Low (< 1 req/sec) | **PK Index on `short_code`** | Strong consistency |

---

## 9. Short-Code Generation & Collision Math

### 1. Base62 Alphabet & Keyspace Mathematics
$$\text{Keyspace for Length } 6 = 62^6 = \mathbf{56,800,235,584} \quad (\approx \mathbf{56.8 \text{ Billion unique keys}})$$

At $10\text{ Million links/month}$ ($120\text{ Million/year}$), storing links for **100 years** ($12\text{ Billion links}$) utilizes only **21.1%** of the 6-character Base62 keyspace.

### 2. Collision Probability Formula (Birthday Problem)
For $N$ generated keys in keyspace $K = 62^6 \approx 56.8 \times 10^9$:

$$P(\text{at least 1 collision}) \approx 1 - e^{-\frac{N^2}{2K}}$$

* **At 1 Million stored links**: $P(\text{collision}) \approx \mathbf{0.00088\%}$.
* **At 10 Million stored links**: $P(\text{collision}) \approx \mathbf{0.088\%}$.

### 3. V1 Implementation: Random Base62 with DB Retry Loop
1. App server generates a random 6-character Base62 string (`[a-zA-Z0-9]{6}`).
2. Attempts `INSERT INTO links`.
3. If PostgreSQL returns error code `23505` (`unique_violation`), the application catches the exception and retries with a new random Base62 string (up to 3 retries).
4. Because the probability of collision per attempt is $< 0.1\%$, the retry loop virtually never executes, providing zero impact on creation latency.

---

## 10. HTTP 302 Redirect Decision & Cache-Control

* **HTTP 302 Found (Selected)**: Directs the browser to perform a temporary redirect without local permanent caching.
* **Headers Issued**:
  ```http
  HTTP/1.1 302 Found
  Location: https://example.com/target
  Cache-Control: no-cache, no-store, must-revalidate
  Pragma: no-cache
  Expires: 0
  ```
* **Technical Rationale**: Explicit `Cache-Control` headers prevent browser-level caching. Every click hits our server, guaranteeing accurate click tracking and allowing target URL updates (P1) or deactivations (`DELETE`) to take effect instantly.

---

## 11. Durability & RPO Realities ($RPO = 0$)

* **Database Engine Durability (ACID WAL)**: PostgreSQL writes transaction logs (Write-Ahead Logging) to disk before acknowledging `INSERT` completion. This guarantees survival against database process crashes.
* **Infrastructure Durability ($RPO = 0$)**: Achieving true zero data loss across catastrophic hardware failures requires infrastructure-level operational practices (e.g. synchronous WAL streaming replication to a standby node, automated point-in-time snapshots). These are deployment infrastructure concerns, not intrinsic properties of single-node database software.

---

## 12. Failure Analysis Matrix

| Failure Mode | System Impact | User Experience | Recovery / Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **App Server Node Crash** | 1 instance drops | Zero downtime (Load balancer routes to remaining instances) | Stateless instance self-heals / restarts |
| **Database Disconnection** | App cannot query DB | HTTP `503 Service Unavailable` returned | Connection pool retries with backoff |
| **Invalid Short Code** | Code missing in DB | HTTP `404 Not Found` returned | Handled cleanly; no server error logged |
| **Deactivated Link** | `is_active == false` | HTTP `410 Gone` returned | Handled cleanly; redirect suppressed |
| **Duplicate Short Code** | Random Base62 collision | Transparent to user (App server catches error & retries) | Up to 3 retry attempts before returning 500 |
| **Click Counter Failure** | Async Background Task drops write | **HTTP 302 redirect completes successfully with zero delay** | **Counter update is swallowed & logged; redirect NEVER fails** |

---

## 13. Architecture Diagram (V1 MVP Baseline)

```
                                  [ PUBLIC INTERNET ]
                                           |
                                           v
                              +--------------------------+
                              |   Load Balancer (HTTP)   |
                              +--------------------------+
                                           |
                                           v
                              +--------------------------+
                              |    Application Server    |
                              |  (Stateless API + 302)   |
                              +--------------------------+
                                           |
                                           | SQL (Pooled Connections)
                                           v
                              +--------------------------+
                              |   PostgreSQL Database    |
                              |  (Primary Relational DB) |
                              +--------------------------+
```

---

## 14. Potential Bottleneck Hypotheses (Ranked for Testing)

1. **Hypothesis 1 (Click-Counter Write Lock Contention)**: Concurrent `UPDATE click_count` background tasks on popular short links may create PostgreSQL row-level lock contention under high load.
   * *Mitigation in Phase 5*: Decouple click metrics via asynchronous message queues (Kafka/RabbitMQ).
2. **Hypothesis 2 (Database Connection Pool Limits)**: High concurrent HTTP requests may exhaust PostgreSQL client connection limits.
   * *Mitigation in Phase 4*: Implement app-level connection pooling (PgBouncer) and read caching.
3. **Hypothesis 3 (Index Memory Saturation)**: As the `links` table grows to tens of millions of rows, the B-Tree index on `short_code` may exceed database RAM (`shared_buffers`), forcing disk reads.
   * *Mitigation in Phase 4*: Introduce Redis caching for hot short links.

---

## 15. Future Evolution Map

```
+-----------------------------------------------------------------------------------+
|                             PROGRESSIVE EVOLUTION MAP                             |
+-----------------------------------------------------------------------------------+
|  PHASE 2 (Current) : Stateless Monolith App + PostgreSQL Relational Database      |
|                             |                                                     |
|                             v (High Key Collisions at Tens of Billions)           |
|  PHASE 3           : Introduce Dedicated Key Generator Service (KGS)             |
|                             |                                                     |
|                             v (DB Read Saturation under 3,858 req/sec Target)     |
|  PHASE 4           : Introduce Redis In-Memory Caching Layer on Read Path         |
|                             |                                                     |
|                             v (DB Write Lock Contention on Click Counters)        |
|  PHASE 5           : Introduce Kafka / RabbitMQ Async Event Streaming             |
|                             |                                                     |
|                             v (Malware / Cloaking Exploits)                       |
|  PHASE 6           : Introduce Async Threat Scanning & SSRF Guard Workers       |
|                             |                                                     |
|                             v (Global Traffic Scaling)                            |
|  PHASE 7           : Introduce Kubernetes Scaling & Multi-Region Database Read    |
|                      Replicas                                                     |
+-----------------------------------------------------------------------------------+
```

---

## 16. Final Consistency Verification (10-Point Audit)

- [x] **1. No synchronous DB write on redirect hot path**: Redirect dispatches 302 header immediately; click_count update is best-effort background task.
- [x] **2. Redirect failure is independent of click counter failure**: DB write errors in click counting are caught and logged; 302 redirect never fails.
- [x] **3. No Redis/Kafka/Kubernetes prematurely introduced**: Kept strictly out of Phase 2 MVP.
- [x] **4. PostgreSQL is the sole Phase 2 source of truth**: Stores all accounts, mappings, and counters.
- [x] **5. RPO=0 described as operational/deployment requirement**: Separated database WAL logging from infrastructure-level replication/backups.
- [x] **6. Performance numbers labeled as targets/assumptions**: Unbenchmarked metrics tagged with `[ASSUMPTION]` and `[BENCHMARK TARGET]`.
- [x] **7. Architecture remains 3-tier**: Client $\rightarrow$ Load Balancer $\rightarrow$ Application Server $\rightarrow$ PostgreSQL.
- [x] **8. API Key security model consistent**: `SHA-256(api_key)` stored in DB; raw keys returned once at creation time.
- [x] **9. Pagination model consistent**: Limit/Offset without `COUNT(*)` (`?limit=20&offset=0`).
- [x] **10. Click counter best-effort nature documented**: Lost updates during process crashes explicitly acknowledged as acceptable for V1 MVP.

---

# PHASE 2 IS OFFICIALLY LOCKED 🔒
