# Smart URL Intelligence Platform
## Phase 1 — Final Locked Product & Requirements Specification

---

## 1. Executive Summary

The **Smart URL Intelligence Platform** is a developer-first, programmatic URL shortening and traffic routing engine. Designed with a strict commitment to progressive complexity, this platform starts as a simple, high-performance web service and systematically evolves into a scalable distributed system.

Phase 1 defines **WHAT** the product does, **WHO** it serves, **HOW FAST** it must perform, and **WHAT** boundaries prevent scope creep. Architecture, database selection, caching strategies, and infrastructure tools are intentionally postponed to later phases.

---

## 2. Core Engineering Philosophy & Taxonomical Categories

We follow a strict learning and system-design rule:
$$\mathbf{BUILD\ SIMPLE} \longrightarrow \mathbf{MEASURE} \longrightarrow \mathbf{FIND\ A\ REAL\ PROBLEM} \longrightarrow \mathbf{INTRODUCE\ THE\ NEXT\ CONCEPT}$$

To maintain total technical clarity, every statement in this specification belongs to exactly one of four taxonomical categories:

1. **PRODUCT REQUIREMENT**: What the system must functionally deliver to users (e.g., HTTP 302 redirection for public visitors, zero IP collection).
2. **ENGINEERING TARGET**: Performance, latency, and availability benchmarks (e.g., P99 < 50ms backend redirect latency, 99.99% redirect engine uptime).
3. **IMPLEMENTATION DETAIL**: How a feature is satisfied under the hood (e.g., transactional ACID persistence, atomic integer increment).
4. **FUTURE DESIGN DECISION**: Infrastructure or algorithms chosen in later phases (e.g., Redis caching in Phase 4, Kafka event queues in Phase 5).

---

## 3. Product Vision & Priority Matrix

```
+-----------------------------------------------------------------------------------+
|                               FEATURE PRIORITY MATRIX                             |
+-----------------------------------------------------------------------------------+
|  P0 (MVP / V1)   : REST API Creation, 302 Redirects, API Key Auth, Atomic Counter, |
|                    http/https 2048-char bounds, Zero IP logging, Soft Delete       |
|  P1 (V2 Core)    : Custom Aliases, Optional TTL Expiration, Target URL Editing    |
|  P2 (Advanced)   : Geo-routing, Password Links, Detailed Async Event Logging      |
|  FUTURE          : AI Traffic Anomaly Detection, Automated Phishing Models         |
+-----------------------------------------------------------------------------------+
```

---

## 4. Primary User Persona & User Model

* **Primary Target User** [PRODUCT REQUIREMENT]: Developers & API Consumers.
* **Core Interface** [PRODUCT REQUIREMENT]: Clean REST JSON API, Bearer API Key Authentication, Rate Limit Headers (`X-RateLimit-Remaining`), Deterministic HTTP Error Schemas.
* **Strict User Model Separation**:
  * **Link Creator (Developer)** [PRODUCT REQUIREMENT]: Must authenticate via Bearer API Key to create, list, inspect, or deactivate short links.
  * **Link Visitor (End User)** [PRODUCT REQUIREMENT]: **100% Anonymous & Public**. Anyone on the internet can click `GET /s/:code` without authentication, cookies, or login tokens.

---

## 5. Core User Journeys

### Journey A: Creating a Short URL (Authenticated Developer)
1. **User Action**: Sends `POST /api/v1/links` with `target_url` and `Authorization: Bearer <api_key>`.
2. **System Action**: Validates API Key $\rightarrow$ Validates `http/https` scheme & length $\le 2048$ chars $\rightarrow$ Generates unique Base62 code $\rightarrow$ Persists mapping.
3. **Expected Result**: HTTP `201 Created` with JSON payload containing short code, full short URL, and creation timestamp.
4. **Possible Failure**: Invalid URL syntax, payload > 2048 chars, or unauthorized API Key.
5. **User Response**: HTTP `400 Bad Request` or `401 Unauthorized`.

### Journey B: Opening a Short URL (Public Visitor)
1. **User Action**: Navigates to `https://short.ly/s/abc123` in a web browser.
2. **System Action**: Receives `GET /s/abc123` $\rightarrow$ Resolves mapping $\rightarrow$ Increments atomic click counter $\rightarrow$ Issues 302 redirect.
3. **Expected Result**: HTTP `302 Found` with `Location: <target_url>` header.
4. **Possible Failure**: Code not found or link deactivated.
5. **User Response**: HTTP `404 Not Found` or `410 Gone`.

### Journey C: Listing Created Links
1. **User Action**: Authenticated developer sends `GET /api/v1/links`.
2. **System Action**: Validates API Key $\rightarrow$ Queries active links owned by the user.
3. **Expected Result**: HTTP `200 OK` with paginated JSON list of links (code, target URL, click count, creation date).

### Journey D: Deactivating a Link
1. **User Action**: Authenticated developer sends `DELETE /api/v1/links/:code`.
2. **System Action**: Validates API Key $\rightarrow$ Verifies ownership $\rightarrow$ Sets status to `DEACTIVATED`.
3. **Expected Result**: HTTP `200 OK` or `204 No Content`. Subsequent redirects return HTTP `410 Gone`.

---

## 6. Functional Requirements Matrix

| ID | Requirement Name | Category | Priority | User Value / Reason | Success Condition | Phase |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-001** | Create Short URL | Product Req | **P0** | Programmatic link generation | Valid `http/https` URL returns unique Base62 code | V1 MVP |
| **FR-002** | Redirect Short URL | Product Req | **P0** | Routes visitors to target URL | GET `/s/:code` returns HTTP 302 Found | V1 MVP |
| **FR-003** | Unique Code Gen | Product Req | **P0** | Prevents code collisions | Generates Base62 codes (min length 6) | V1 MVP |
| **FR-004** | URL Syntax & Length | Product Req | **P0** | Prevents invalid/exploit URLs | Restricts to `http/https` & $\le 2048$ chars | V1 MVP |
| **FR-005** | API Key Creator Auth | Product Req | **P0** | Secures link management | Creator attached via Bearer Token | V1 MVP |
| **FR-006** | List Creator's Links | Product Req | **P0** | Audit capability | GET `/api/v1/links` returns user's links | V1 MVP |
| **FR-007** | Deactivate Link | Product Req | **P0** | Revocation control | DELETE `/api/v1/links/:code` sets status `DEACTIVATED` | V1 MVP |
| **FR-008** | Atomic Click Counter | Product Req | **P0** | Basic metric value | Successful 302 increments `click_count` | V1 MVP |
| **FR-009** | Rate Limiting | Product Req | **P0** | Abuse prevention | Quota exceeded returns HTTP 429 | V1 MVP |
| **FR-010** | Custom Short Alias | Product Req | **P1** | Branded short URLs | User specifies custom code | V2 Core |
| **FR-011** | Link Expiration (TTL) | Product Req | **P1** | Time-bound promos | Automatically revokes old links | V2 Core |
| **FR-012** | Target URL Editing | Product Req | **P1** | Dynamic destination | Update target without changing short code | V2 Core |
| **FR-013** | Async Click Logging | Product Req | **P2** | Deep analytics | User-Agent, Referer, Timestamp logs | Phase 5 |
| **FR-014** | Malware/Threat API | Product Req | **P1** | Spam protection | Async domain check via threat API | Phase 6 |

---

## 7. Non-Functional Requirements & Engineering Targets

### 1. Latency SLAs (Backend Execution Budget) [ENGINEERING TARGET]
* **Redirect Path (Read SLA - P0)**: P50 < 10ms | P95 < 25ms | **P99 < 50ms** (Backend processing time excluding Internet RTT).
* **Create Path (Write SLA - P0)**: **P99 < 200ms**.
* **Management API SLA**: **P99 < 300ms**.

### 2. Decoupled Availability Targets [ENGINEERING TARGET]
* **Redirect Engine (Read Path)**: **99.99% ("Four Nines")** $\rightarrow < 52.56 \text{ mins/year downtime}$. (Critical: broken redirects break published links globally).
* **Link Creation API (Write Path)**: **99.9% ("Three Nines")** $\rightarrow < 8.76 \text{ hours/year downtime}$.
* **Management & Analytics APIs**: **99.0% ("Two Nines")**.

### 3. Durability Requirement [PRODUCT REQUIREMENT]
* **Target**: **Zero Loss of Acknowledged Mappings ($RPO = 0$)**. Once `POST /links` returns HTTP 201, the mapping must persist through server crashes via ACID transactional persistence.

---

## 8. Scale Assumptions (Engineering Capacity Benchmark)

* **Baseline Assumptions** [ENGINEERING TARGET]:
  * New URLs Created / Month: $10,000,000$ ($10\text{ Million}$) `[ASSUMPTION]`
  * Total Redirects / Month: $1,000,000,000$ ($1\text{ Billion}$) `[ASSUMPTION]`
  * Read-to-Write Ratio: $100 : 1$ `[ASSUMPTION]`
  * Peak Multiplier: $10\times$ `[ASSUMPTION]`

### Throughput Derivations
$$\text{Seconds/Month} = 30 \text{ days} \times 24 \text{ hours} \times 3600 \text{ sec} = 2,592,000 \text{ seconds}$$

* **Write Path**: Average = $\frac{10\text{M}}{2.592\text{M}} = \mathbf{3.86 \text{ writes/sec}}$ | Peak = $3.86 \times 10 = \mathbf{38.6 \text{ writes/sec}}$.
* **Read Path**: Average = $\frac{1\text{B}}{2.592\text{M}} = \mathbf{385.8 \text{ reads/sec}}$ | Peak = $385.8 \times 10 = \mathbf{3,858 \text{ reads/sec}}$.

### Storage Derivations
* Mapping Record Size: `short_code` (7 B) + `user_id` (16 B) + `target_url` (250 B avg) + `created_at` (8 B) + Indexing Overhead (~154 B) $\approx \mathbf{435 \text{ bytes/record}}$.
* **Daily Growth**: $333,333 \text{ links/day} \times 435 \text{ B} \approx \mathbf{145 \text{ MB/day}}$.
* **Yearly Growth**: $145 \text{ MB/day} \times 365 \text{ days} \approx \mathbf{52.9 \text{ GB/year}}$.

---

## 9. Read Path vs. Write Path Characteristics

```
+-----------------------------------------------------------------------------------+
|                        READ PATH vs WRITE PATH DYNAMICS                           |
+-----------------------------------------------------------------------------------+
|  FEATURE             | WRITE PATH (Creation)          | READ PATH (Redirect)      |
+----------------------+--------------------------------+---------------------------+
|  Primary Operation   | Validation, Auth, Key Gen, DB  | Lookup code, 302 Header   |
|  Throughput (Peak)   | Low (~38 req/sec)              | High (~3,858 req/sec)     |
|  Latency SLA         | Sub-200ms P99                  | Sub-50ms P99              |
|  Consistency         | Strong Database Write          | Fast Cache-First Lookups  |
|  Side-Effects        | API Rate Limit Check           | Atomic Click Counter ++   |
+----------------------+--------------------------------+---------------------------+
```

---

## 10. Data Correctness Guarantees [PRODUCT REQUIREMENT]

1. **Code Uniqueness**: Strict global unique constraint on `short_code`.
2. **Read-After-Write Consistency**: Creator immediately sees newly created link in `GET /links`.
3. **Deterministic Mapping**: A short code resolves to its target URL or HTTP 404/410.
4. **Analytics Consistency**: Atomic counter increments are eventually consistent (lag $< 1 \text{ second}$ under concurrency).

---

## 11. Security Requirements [PRODUCT REQUIREMENT]

* **URL Validation (P0)**: Restrict scheme strictly to `http://` and `https://`; enforce max length $\le 2048$ chars.
* **API Rate Limiting (P0)**: Enforce 60 creation requests/min per API Key.
* **Open Redirect Behavior (P0)**: Intentionally redirects visitors to external domains; security relies on scheme validation and rate limits.
* **Malware Blocklists (P1 - Phase 6)**: Asynchronous domain checking against threat APIs.
* **SSRF Guard (Future Design Decision)**: Reclassified to Phase 6 when background workers actively fetch destination web pages to scan content or extract titles.

---

## 12. Privacy Requirements (V1 Zero-IP Model) [PRODUCT REQUIREMENT]

* **V1 MVP Rule**: **Zero Client IP Collection / Storage**.
* V1 does not log, hash, or inspect visitor IP addresses. It tracks aggregate integer clicks only (`click_count += 1`).
* **Benefit**: Complete elimination of GDPR/CCPA PII compliance risk for V1. Granular IP anonymization pipelines deferred to Phase 5.

---

## 13. Failure Behavior Matrix

| Failure Mode | Expected System Behavior [PRODUCT REQUIREMENT] | Degradation Strategy [IMPLEMENTATION DETAIL] |
| :--- | :--- | :--- |
| **Database Unavailable** | Read Path attempts cache lookup (if configured in P4); Write Path returns HTTP 503. | **DEGRADE WRITES / PRESERVE READS** |
| **Invalid Short Code** | System returns HTTP `404 Not Found`. | **MUST WORK** |
| **Deactivated Link** | System returns HTTP `410 Gone`. | **MUST WORK** |
| **Click Counter Failure** | System ignores counter write error and completes 302 redirect. | **MUST NOT BLOCK REDIRECT** |

---

## 14. Observability Requirements [PRODUCT REQUIREMENT]

* **Structured JSON Logs**: `trace_id`, `user_id`, `short_code`, `status_code`, `latency_ms`.
* **Core Metrics**:
  * Redirect Success Rate (`302` vs `404/410/500`).
  * P50 / P95 / P99 Backend Latency.
  * API Creation Write Error Rate.
* **Correlation**: Simple `X-Trace-ID` request header propagation.

---

## 15. MVP Scope (V1 Core)

* `POST /api/v1/links`: Create short URL (Auth required, `http/https` check, 2048 char max).
* `GET /s/:code`: High-performance HTTP 302 redirect engine.
* `GET /api/v1/links`: List creator's links.
* `DELETE /api/v1/links/:code`: Soft-deactivate link.
* Atomic `click_count` increment on redirect.

---

## 16. Out of Scope

Visual Web UI Dashboard, Custom Domains (`link.brand.com`), Password-Protected Links, Geo-routing, Third-Party Threat APIs (in V1), Multi-Region Active-Active, Kubernetes, Kafka, Redis, AI URL Analysis.

---

## 17. Deferred Implementation Decisions [FUTURE DESIGN DECISION]

1. **Database Technology & Schema**: Deferred to **Phase 2 (Architecture & Data Model)**.
2. **Short-Code Generation Algorithm**: Deferred to **Phase 2 & Phase 3**.
3. **Caching & Eviction Strategy**: Deferred to **Phase 4**.
4. **Message Queue Architecture**: Deferred to **Phase 5**.

---

## 18. Phase 1 Completion Checklist

- [x] Core problem & learning philosophy established.
- [x] Target user (Developer) decoupled from visitor (Anonymous).
- [x] Ruthless P0 MVP scope established (No premature complexity).
- [x] Operational SLAs decoupled (99.99% Read vs 99.9% Write).
- [x] Capacity scale math derived ($10\text{M}$ writes/mo, $1\text{B}$ reads/mo).
- [x] Technical misnomers corrected (SSRF reclassified to Phase 6).
- [x] Privacy model simplified (Zero IP collection in V1).
- [x] Fail-safe degradation rules established.
- [x] Final 5 product decisions approved by user.

---

# PHASE 1 IS OFFICIALLY LOCKED 🔒

**All Phase 1 product requirements, SLAs, scale models, user journeys, and scope boundaries are finalized and approved.**

No further edits will be made to Phase 1. We are ready for **Phase 2 (Architecture & Data Model Design)** whenever you instruct us to begin.
