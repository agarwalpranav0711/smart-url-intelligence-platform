# Smart URL Intelligence Platform

[![Node.js CI](https://img.shields.io/badge/Node.js-v18%2B-brightgreen)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-v16%2B-blue)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Unlicensed-lightgrey)](#license)

A high-performance, production-hardened, production-ready MVP URL shortener API built with Node.js, Express, and PostgreSQL. Designed with strong security boundaries, CSPRNG Base62 short-code generation, database-backed collision safety, process-local rate limiting, structured Pino logging, and lightweight observability.

---

## 1. Overview

The **Smart URL Intelligence Platform** is a developer-focused HTTP service providing core short URL management and high-throughput redirection capabilities. The system allows authenticated developers to create short links, list their links with pagination support, and soft-deactivate links while maintaining historical analytical integrity.

Public clients can resolve active 6-character short codes to original target URLs via fast HTTP 302 redirects with non-blocking atomic click tracking.

---

## 2. Core Features

* **High-Throughput Redirection**: Public `GET /s/:code` endpoint issuing fast `HTTP 302 Found` redirects.
* **CSPRNG Base62 Engine**: Generates 6-character cryptographically secure short codes with rejection sampling to eliminate modulo bias.
* **Database-Enforced Uniqueness**: Relies on PostgreSQL `PRIMARY KEY` constraints with a 3-attempt collision retry strategy.
* **Bearer API-Key Authentication**: Secure developer authentication using SHA-256 API key hashing. Raw API keys are never stored, logged, or returned.
* **Strict Ownership Isolation**: Authenticated identity (`req.user.userId`) strictly bounds all link operations. Spoofed client parameters (e.g., `user_id`) are ignored.
* **Soft Deactivation**: `DELETE /api/v1/links/:code` marks links as inactive (`is_active = false`) without physical row deletion, serving `HTTP 410 Gone` on subsequent access.
* **Non-Blocking Click Tracking**: Atomic SQL-side increment (`click_count = click_count + 1`) executed asynchronously without blocking the HTTP 302 redirect response.
* **API-Key Rate Limiting**: Enforces 60 link creation requests per 60-second window per authenticated user identity.
* **Lightweight Observability**: Includes structured JSON logging via `pino`, process-local counter metrics (`GET /metrics`), and a database health check (`GET /health`).

---

## 3. Architecture

The system follows a clean, 3-tier stateless application server model:

```
Client (HTTP / HTTPS)
       │
       ▼
Application Server (Node.js / Express.js)
 ├── Middleware: Request Logger, Bearer Auth, Rate Limiter
 ├── Services: Link Service, Base62 Generator
 └── Observability: Pino Logger, Metrics Counters, Health Check
       │
       ▼
Database Tier (PostgreSQL 16)
 ├── users (user_id PK, api_key_hash UNIQUE)
 └── links (short_code PK, target_url, user_id FK, click_count, is_active)
```

### Key Architectural Characteristics:
* **Stateless Application Server**: Scalable across multiple process instances behind a load balancer.
* **Process-Local Rate Limiting & Metrics**: In-memory MVP mechanisms avoiding third-party cache dependencies like Redis.
* **Asynchronous Execution**: Click count increments execute out-of-band via fire-and-forget promises to prioritize low latency on redirect paths.

---

## 4. API Endpoints

### Operational & Public Endpoints
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/users` | No | Developer account registration & initial API key provisioning. |
| `GET` | `/health` | No | Pure process liveness check (`HTTP 200 {"status":"ok","uptime":...}`). |
| `GET` | `/ready` | No | Readiness check verifying active state & PostgreSQL connectivity (`HTTP 200 / 503`). |
| `GET` | `/metrics` | No | Returns process-local operational metrics snapshot. |
| `GET` | `/docs` | No | Interactive Swagger UI API documentation. |
| `GET` | `/s/:code` | No | Public short code redirect (`HTTP 302`). |

### Authenticated Management Endpoints (v1)
| Method | Endpoint | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/api-keys` | Yes (`Bearer`) | Provision a secondary API key for rotation/multi-environment. |
| `GET` | `/api/v1/api-keys` | Yes (`Bearer`) | List developer's API keys (without raw keys/hashes). |
| `DELETE` | `/api/v1/api-keys/:id` | Yes (`Bearer`) | Soft-revoke an API key owned by the developer. |
| `POST` | `/api/v1/links` | Yes (`Bearer`) | Create a new short link for the authenticated user. |
| `GET` | `/api/v1/links` | Yes (`Bearer`) | Paginated listing of short links owned by user. |
| `DELETE` | `/api/v1/links/:code` | Yes (`Bearer`) | Soft-deactivate a short link owned by user. |

---

## 5. Request/Response Examples

### 1. Create Short Link (`POST /api/v1/links`)
**Request**:
```http
POST /api/v1/links HTTP/1.1
Host: api.shortener.local
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json

{
  "target_url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview"
}
```

**Response (`HTTP 201 Created`)**:
```json
{
  "short_code": "aB3x9Z",
  "target_url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview",
  "created_at": "2026-09-16T12:00:00.000Z"
}
```

---

### 2. List Links (`GET /api/v1/links?limit=2&offset=0`)
**Request**:
```http
GET /api/v1/links?limit=2&offset=0 HTTP/1.1
Host: api.shortener.local
Authorization: Bearer <YOUR_API_KEY>
```

**Response (`HTTP 200 OK`)**:
```json
{
  "links": [
    {
      "short_code": "aB3x9Z",
      "target_url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview",
      "click_count": 42,
      "is_active": true,
      "created_at": "2026-09-16T12:00:00.000Z"
    }
  ],
  "limit": 2,
  "offset": 0
}
```

---

### 3. Soft-Deactivate Link (`DELETE /api/v1/links/:code`)
**Request**:
```http
DELETE /api/v1/links/aB3x9Z HTTP/1.1
Host: api.shortener.local
Authorization: Bearer <YOUR_API_KEY>
```

**Response (`HTTP 200 OK`)**:
```json
{
  "message": "Link deactivated"
}
```

---

### 4. Public Short Code Redirect (`GET /s/:code`)
**Request**:
```http
GET /s/aB3x9Z HTTP/1.1
Host: api.shortener.local
```

**Response (`HTTP 302 Found`)**:
```http
HTTP/1.1 302 Found
Location: https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview
Content-Length: 0
```

*Note: Accessing an inactive link returns `HTTP 410 Gone`:*
```json
{
  "error": {
    "code": "LINK_INACTIVE",
    "message": "Short link is inactive"
  }
}
```

---

## 6. Authentication

Management endpoints (`/api/v1/*`) require HTTP Bearer authentication:
`Authorization: Bearer <API_KEY>`

### Security Principles:
* **SHA-256 Hashing**: Incoming raw API keys are hashed via SHA-256 immediately upon receipt and looked up against `users.api_key_hash`.
* **Zero Plaintext Storage**: Raw API keys are never stored in PostgreSQL, never logged, and never returned in API payloads.
* **User Identity Binding**: Successful authentication attaches `req.user = { userId: user.user_id }`.

---

## 7. Short-Code Generation

The short-code generator ([`src/utils/base62.js`](file:///d:/WebDev%20PROJECTS/tiny%20url/src/utils/base62.js)) constructs 6-character strings using the Base62 character set (`[a-z, A-Z, 0-9]`).

* **Crypto CSPRNG**: Uses `crypto.randomBytes` instead of non-cryptographic pseudo-random number generators.
* **Rejection Sampling**: Discards random bytes $\ge 248$ ($62 \times 4$) to eliminate modulo bias.
* **Collision Handling**: Database uniqueness is authoritative (`PRIMARY KEY`). On PostgreSQL `23505` (`unique_violation`), the link service automatically retries generation up to **3 total attempts**.

---

## 8. Database Design

PostgreSQL 16 relational schema ([`schema.sql`](file:///d:/WebDev%20PROJECTS/tiny%20url/schema.sql)):

```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE links (
    short_code VARCHAR(10) PRIMARY KEY,
    target_url VARCHAR(2048) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    click_count BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_links_user_created ON links (user_id, created_at DESC);
```

---

## 9. Rate Limiting

Rate limiting ([`src/middleware/rateLimit.js`](file:///d:/WebDev%20PROJECTS/tiny%20url/src/middleware/rateLimit.js)) is applied exclusively to link creation (`POST /api/v1/links`):

* **Policy**: 60 requests per 60 seconds per authenticated user (`req.user.userId`).
* **Headers**: Implements IETF Draft-8 rate limit headers (`RateLimit-*`).
* **Exceeded Response (`HTTP 429 Too Many Requests`)**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many link creation requests"
  }
}
```

---

## 10. Redirect and Click Counting

The redirect path (`GET /s/:code`) prioritizes execution speed:

1. Queries PostgreSQL by `short_code`.
2. Validates record existence (`HTTP 404`) and `is_active` status (`HTTP 410`).
3. Dispatches an asynchronous, atomic SQL click increment:
   `UPDATE links SET click_count = click_count + 1 WHERE short_code = $1 AND is_active = true`
4. Immediately returns `HTTP 302 Found` with `Location: target_url`.

*Note: Asynchronous click count failures are silently logged internally and will NOT block or fail the client redirect.*

---

## 11. Observability

* **Structured Logging**: Powered by `pino` ([`src/utils/logger.js`](file:///d:/WebDev%20PROJECTS/tiny%20url/src/utils/logger.js)) emitting JSON event logs (`server.started`, `request.completed`, `link.created`, `link.redirected`, `link.deactivated`, `rate_limit.exceeded`, `database.error`).
* **Metrics Snapshot (`GET /metrics`)**: Exposes in-memory operational counters (`link_creations_total`, `link_creation_errors_total`, `redirects_total`, `redirect_not_found_total`, `redirect_inactive_total`, `deactivations_total`, `rate_limit_exceeded_total`, `http_4xx_total`, `http_5xx_total`).
* **Health Check (`GET /health`)**: Runs `SELECT 1` against PostgreSQL to verify connectivity, returning `{ "status": "ok" }` (`200 OK`) or `{ "status": "unhealthy" }` (`503 Service Unavailable`).

---

## 12. Error Handling

All error responses return structured JSON:

```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human-readable error description"
  }
}
```

### Common Error Codes:
* `400 Bad Request`: `INVALID_REQUEST` (Malformed JSON, URL validation error, bad pagination parameters).
* `401 Unauthorized`: `UNAUTHORIZED` (Missing, malformed, or invalid API key).
* `404 Not Found`: `NOT_FOUND` (Nonexistent short code or unmapped endpoint).
* `410 Gone`: `LINK_INACTIVE` (Soft-deactivated short code).
* `429 Too Many Requests`: `RATE_LIMIT_EXCEEDED` (Rate limit limit exceeded).
* `500 Internal Server Error`: `INTERNAL_SERVER_ERROR` (Unexpected internal errors).
* `503 Service Unavailable`: `UNHEALTHY` (Database health ping failure).

---

## 13. Project Structure

```
.
├── .env.example                # Configuration template
├── .gitignore                  # Git exclude definitions
├── package.json                # Project dependencies and test scripts
├── schema.sql                  # PostgreSQL database DDL schema
├── scripts/
│   └── setup-db.js             # Database migration initialization script
├── src/
│   ├── app.js                  # Express application configuration
│   ├── server.js               # Entry point with server startup & shutdown
│   ├── config/
│   │   └── db.js               # PostgreSQL pg.Pool configuration
│   ├── controllers/
│   │   ├── linkController.js   # Handlers for link creation, listing, deactivation
│   │   ├── opsController.js    # Handlers for /health and /metrics
│   │   └── redirectController.js # Handler for public /s/:code redirects
│   ├── db/
│   │   ├── links.js            # Data access layer for links table
│   │   └── users.js            # Data access layer for users table
│   ├── middleware/
│   │   ├── auth.js             # Bearer API key authentication
│   │   ├── rateLimit.js        # Express rate limiter configuration
│   │   └── requestLogger.js    # Request timing & HTTP metric logger
│   ├── routes/
│   │   ├── linkRoutes.js       # Authenticated /api/v1 routes
│   │   ├── opsRoutes.js        # Public operational routes
│   │   └── redirectRoutes.js   # Public redirect routes
│   ├── services/
│   │   └── linkService.js      # Business logic & collision retry handling
│   └── utils/
│       ├── base62.js           # CSPRNG Base62 code generator
│       ├── logger.js           # Pino logger configuration
│       └── metrics.js          # Process-local metrics counter registry
└── test/
    ├── integration.js          # Master integration test runner
    ├── step3-auth.test.js      # Step 3 Auth verification suite
    ├── step4-links.test.js     # Step 4 Create Link verification suite
    ├── step5-redirect.test.js  # Step 5 Redirect verification suite
    ├── step6-list.test.js      # Step 6 Listing verification suite
    ├── step7-deactivate.test.js # Step 7 Soft-Deactivation suite
    ├── step8-rate-limit.test.js # Step 8 Rate limiting suite
    ├── step9-observability.test.js # Step 9 Observability suite
    └── step10-final.test.js    # Step 10 Final audit & hardening suite
```

---

## 14. Getting Started

### Prerequisites
* Node.js v18.0.0 or higher
* PostgreSQL v16.0 or higher

---

## 15. Environment Variables

Create a `.env` file in the root directory based on `.env.example`:

```bash
cp .env.example .env
```

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port for the HTTP server to listen on. |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`). |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/url_shortener` | PostgreSQL connection string. |
| `LOG_LEVEL` | `info` | Minimum log level for Pino (`debug`, `info`, `warn`, `error`). |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limiter window in milliseconds. |
| `RATE_LIMIT_MAX_REQUESTS` | `60` | Maximum link creations per window per user. |

---

## 16. Running PostgreSQL Locally

1. Create a local PostgreSQL database named `url_shortener`:
   ```bash
   createdb -U postgres url_shortener
   ```

2. Run the database setup script to apply the schema migration:
   ```bash
   npm run setup-db
   ```
   *(Or execute `psql -U postgres -d url_shortener -f schema.sql` manually).*

---

## 17. Running the Application

### Option A: Running via Docker Compose (Recommended)

Start the Node application and PostgreSQL database with a single command:

```bash
# Build images and start containers in detached mode
docker compose up --build -d

# Check status of running containers
docker compose ps

# View application logs
docker compose logs -f app

# Stop containers (preserves database volume)
docker compose down

# Stop containers and reset database volume (Destructive Reset)
docker compose down -v
```

### Option B: Running Natively on Host System

#### Development Mode (with hot-reload):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

---

## 18. Running Tests

Run the complete, automated end-to-end integration test suite (Steps 3 through 10):

```bash
npm test
```

*Note: Tests require an active PostgreSQL instance running on the configured `DATABASE_URL`.*

---

## 19. Security Considerations

* **Credential Protection**: Raw API keys are never stored, logged, or returned in HTTP responses.
* **SQL Injection Prevention**: 100% of SQL statements use parameterized queries (`$1`, `$2`).
* **Input Validation**: `target_url` parsing strictly enforces valid syntax, max length of 2048 chars, and restricts schemes exclusively to `http:` and `https:`.
* **Express Hardening**: `X-Powered-By` header disabled; malformed JSON payload handling returns clean HTTP 400 JSON without stack traces.

---

## 20. Design Decisions

* **Base62 vs Sequential Base64**: Base62 eliminates non-alphanumeric URL special characters (`+`, `/`). CSPRNG randomness prevents short-code enumeration attacks.
* **Soft Deactivation over Physical Deletion**: Preserves historical data integrity and enables consistent `HTTP 410 Gone` behavior.
* **PostgreSQL Authority**: Relies on relational constraints (`PRIMARY KEY` on `short_code`) rather than complex distributed locks for collision handling.

---

## 21. Current Scope / Non-Goals

The following features are **explicitly out of scope** for this MVP release:
* Custom short aliases
* Time-To-Live (TTL) or link expiration dates
* Target URL editing/updating
* Password-protected short links
* Geo-routing / device targeting
* Distributed caching (Redis) / Message brokers (Kafka)
* Frontend user interface or dashboard

---

## 22. Future Work

Potential post-MVP enhancements:
* Distributed rate limiting using Redis / Redis Cluster.
* Asynchronous click stream ingestion via Kafka / RabbitMQ.
* User account registration and self-service API key generation endpoints.
* High-volume link analytics dashboard.

---

## 23. Testing Status

* **Total Integration Assertions**: 171/171 Passed
* **Vulnerability Audit (`npm audit`)**: 0 Vulnerabilities
* **Code Coverage**: Covers Developer Registration, API-Key Auth, Key Rotation & Revocation, Link Creation, Redirects, Listing, Soft Deactivation, Rate Limiting, Observability, and Error Handling.

---

## 24. CI/CD Pipeline (GitHub Actions)

The project includes an automated Continuous Integration (CI) pipeline configured in [`.github/workflows/ci.yml`](file:///d:/WebDev%20PROJECTS/tiny%20url/.github/workflows/ci.yml).

### Workflow Triggers:
* Automated execution on every `push` to `main`/`master`.
* Automated execution on every `pull_request` targeting `main`/`master`.

### Automated Pipeline Jobs:
1. **Repository Checkout**: Pulls clean source code via `actions/checkout@v4`.
2. **Node.js 22 Runtime Setup**: Configures Node.js 22 with `actions/setup-node@v4` and enables dependency caching.
3. **Dependency Installation**: Runs `npm ci` for deterministic dependency resolution.
4. **Ephemeral Database Provisioning**: Spawns an isolated `postgres:16-alpine` service container with health checks (`pg_isready`).
5. **Schema Migration & Verification**: Executes `npm run setup-db` against the CI database.
6. **Integration Test Suite**: Runs `npm test` verifying all 171 assertions against the live PostgreSQL container.
7. **Security Vulnerability Audit**: Runs `npm audit` to detect dependency vulnerabilities.
8. **Docker Build Verification**: Compiles `Dockerfile` (`docker build -t tinyurl-app:latest .`) to verify production container buildability without publishing or deploying.

---

## 25. Load Testing & Performance Baselining (Step 14)

The project includes a reproducible, containerized load-testing suite using [Grafana k6](https://k6.io/) to measure baseline system throughput, latency percentiles, and rate-limiting behavior under load.

> ⚠️ **IMPORTANT**: Load tests must ONLY be executed against local development or dedicated staging environments. Load-test API keys and generated credentials are stored in git-ignored local configuration files (`.env.test`, `load-tests/test-config.json`) and must NEVER be committed to source control.

### Setup Instructions

1. **Start Local Stack**:
   ```bash
   docker compose up -d
   ```

2. **Provision Test Data**:
   ```bash
   node scripts/setup-load-test-data.js
   ```

3. **Execute Benchmark Scenarios**:

   * **Test A — Redirect Read Load** (`GET /s/:code`):
     ```bash
     docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/redirect.js
     ```
   * **Test B — Link Creation Write Load** (`POST /api/v1/links`):
     ```bash
     docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/create.js
     ```
   * **Test C — Mixed Workload** (100 Redirects : 1 Link Creation):
     ```bash
     docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/mixed.js
     ```
   * **Test D — Sustained Moderate Load** (60s steady 30 VUs):
     ```bash
     docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/sustained.js
     ```
   * **Test E — Rate Limit Validation** (75 rapid POSTs for single user identity):
     ```bash
     docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/rate-limit.js
     ```

For detailed educational concepts, percentile explanations, and baseline report data, see [`step_14_load_testing.md`](file:///d:/WebDev%20PROJECTS/tiny%20url/step_14_load_testing.md).

---

## 26. Performance Engineering & Caching (Step 15)

Step 15 introduced evidence-based performance optimizations for the read path (`GET /s/:code`) without changing API contracts or compromising database durability.

### Key Performance Gains

* **Redirect Throughput (RPS)**: Increased from **888.85 req/sec** to **2,649.03 req/sec** (**+198% / 3.0x increase**).
* **Redirect Latency (p50)**: Reduced from **39.22 ms** to **14.73 ms** (**62.4% faster**).
* **Redirect Tail Latency (p99)**: Reduced from **145.02 ms** to **42.58 ms** (**70.6% faster**, satisfying the P99 < 50ms design target).
* **Create Tail Latency (p99)**: Reduced from **187.73 ms** to **16.82 ms** (**91.0% faster**).

### Architectural Optimizations
* **Bounded In-Memory LRU Cache** ([`src/utils/cache.js`](file:///d:/WebDev%20PROJECTS/tiny%20url/src/utils/cache.js)): Eliminates database query overhead for cached short links.
* **Immediate Cache Eviction**: Link deactivation (`DELETE /api/v1/links/:code`) purges cache entries immediately to prevent stale redirects.
* **PostgreSQL Source of Truth**: On cache miss or cache exception, execution falls back transparently to PostgreSQL.

For full bottleneck profiling and before/after benchmark comparisons, see [`step_15_performance_engineering.md`](file:///d:/WebDev%20PROJECTS/tiny%20url/step_15_performance_engineering.md).

---

## 27. Reliability & Failure Mode Testing (Step 16)

Step 16 validated system resiliency, failure modes, error contracts, and automatic recovery behavior across infrastructure components without introducing external daemons.

### Verified Failure & Recovery Behaviors

* **Database Disconnect Resiliency**: When PostgreSQL is stopped, `/health` returns `HTTP 503 {"status":"unhealthy"}` and write endpoints return structured `HTTP 500` JSON errors. Cached redirects (`GET /s/:code`) continue serving `HTTP 302` responses from memory.
* **Automatic DB Recovery**: Upon PostgreSQL restart, application pool connections reconnect automatically without requiring an app container restart.
* **Cache Safety & Eviction**: LRU eviction (`maxSize = 10000`), TTL expiration (5 min), and immediate deactivation/deletion cache purges prevent stale redirects. Cache exceptions fail safely to `null` and fall back to PostgreSQL.
* **Container Failure & Persistence**: Docker Compose restarts (`app`, `postgres`, or stack) preserve all user identities, API keys, and link data via named PostgreSQL volumes (`postgres_data`).
* **Clean Graceful Shutdown**: `SIGTERM` and `SIGINT` handlers drain active HTTP requests via `server.close()`, end pool connections via `pool.end()`, and exit with code 0.
* **Structured Error Contracts**: All 4xx and 5xx responses return sanitized JSON error envelopes without exposing stack traces, SQL queries, credentials, or file paths.

For comprehensive scenario reports and regression verification, see [`step_16_reliability_failure_testing.md`](file:///d:/WebDev%20PROJECTS/tiny%20url/step_16_reliability_failure_testing.md).

---

## 28. API & Database Scalability Audit (Step 17)

Step 17 performed an empirical query audit, EXPLAIN ANALYZE profiling (50,000 link dataset), pagination scalability benchmarking, and index redundancy analysis.

### Audit & Optimization Highlights

* **Redundant Index Removal**: Identified duplicate index `idx_api_keys_hash` on `api_keys(api_key_hash)`. Since `api_key_hash` is declared `UNIQUE` (auto-creating `api_keys_api_key_hash_key`), removing `idx_api_keys_hash` eliminated redundant index maintenance overhead on API key creation.
* **Indexed Redirect Lookup**: `EXPLAIN ANALYZE` verified sub-millisecond execution time (**0.052 ms**) using primary key B-Tree index `links_pkey`.
* **Atomic Click Update**: `EXPLAIN ANALYZE` verified atomic update execution in **0.181 ms**.
* **Pagination Scalability**: Verified composite index `idx_links_user_created` (`user_id, created_at DESC`). Discovered that `LIMIT 20` at `OFFSET 40,000` executes in **< 30 ms** without in-memory `Sort` nodes.
* **Connection Pool Verification**: Confirmed PostgreSQL pool `max: 20` remains optimal under high concurrency.

For full query audits and EXPLAIN ANALYZE reports, see [`step_17_api_database_scalability.md`](file:///d:/WebDev%20PROJECTS/tiny%20url/step_17_api_database_scalability.md).

---

## 29. API Quality, Documentation & Developer Experience (Step 18)

Step 18 established complete OpenAPI 3.0 documentation, interactive Swagger UI API reference, standardized error contracts, and copy-pasteable developer cURL workflows.

### 29.1 OpenAPI 3.0 Specification & Swagger UI

* **OpenAPI 3.0 Spec**: Available at [`docs/openapi.yaml`](file:///d:/WebDev%20PROJECTS/tiny%20url/docs/openapi.yaml) or served directly via `GET /docs/openapi.yaml` and `GET /docs/openapi.json`.
* **Interactive Swagger UI**: Accessible at `http://localhost:3000/docs` when the service is running. Allows zero-setup API testing directly from the browser.

---

### 29.2 End-to-End Developer Workflows (cURL Examples)

All requests assume local environment base URL `http://localhost:3000`.

#### A. Register Developer Account & Generate Primary API Key
```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Initial Key"}'
```
**Expected Response (`HTTP 201 Created`)**:
```json
{
  "user_id": "1b9154d2-72e5-4514-8f9b-af5faf3cee56",
  "key_id": "41a3477a-af91-4977-b929-5ce0a91ad44f",
  "name": "Initial Key",
  "api_key": "sk_live_EXAMPLE_KEY_11111111111111111111111111111111",
  "created_at": "2026-09-19T10:00:00.000Z"
}
```

---

#### B. Create Secondary API Key (Key Rotation)
```bash
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{"name": "Secondary Automation Key"}'
```
**Expected Response (`HTTP 201 Created`)**:
```json
{
  "key_id": "41a3477a-af91-4977-b929-5ce0a91ad44f",
  "name": "Secondary Automation Key",
  "api_key": "sk_live_EXAMPLE_KEY_22222222222222222222222222222222",
  "created_at": "2026-09-19T10:05:00.000Z"
}
```

---

#### C. Create Short URL or Custom Alias (with optional Expiration)
```bash
# 1. Random Base62 Short URL
curl -X POST http://localhost:3000/api/v1/links \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://example.com/docs/developer-guide"}'

# 2. Custom Alias Creation
curl -X POST http://localhost:3000/api/v1/links \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://example.com/portfolio", "alias": "portfolio"}'

# 3. Expiring Link Creation (ISO-8601 Future Timestamp)
curl -X POST http://localhost:3000/api/v1/links \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://example.com/promo", "expires_at": "2026-10-01T12:00:00.000Z"}'
```
**Expected Response (`HTTP 201 Created`)**:
```json
{
  "short_code": "portfolio",
  "target_url": "https://example.com/portfolio",
  "created_at": "2026-09-19T10:10:00.000Z",
  "expires_at": null
}
```
**Expected Response for Duplicate Alias (`HTTP 409 Conflict`)**:
```json
{
  "error": {
    "code": "ALIAS_ALREADY_EXISTS",
    "message": "The requested alias is already in use"
  }
}
```

---

#### D. Edit Target URL / Expiration (`PATCH /api/v1/links/:code`)
```bash
curl -X PATCH http://localhost:3000/api/v1/links/portfolio \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111" \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://example.com/updated-portfolio"}'
```
**Expected Response (`HTTP 200 OK`)**:
```json
{
  "short_code": "portfolio",
  "target_url": "https://example.com/updated-portfolio",
  "is_active": true,
  "created_at": "2026-09-19T10:10:00.000Z",
  "expires_at": null
}
```

---

#### E. List User Links (Paginated)
```bash
curl -X GET "http://localhost:3000/api/v1/links?limit=20&offset=0" \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111"
```
**Expected Response (`HTTP 200 OK`)**:
```json
{
  "links": [
    {
      "short_code": "portfolio",
      "target_url": "https://example.com/updated-portfolio",
      "click_count": 42,
      "is_active": true,
      "created_at": "2026-09-19T10:10:00.000Z",
      "expires_at": null
    }
  ],
  "limit": 20,
  "offset": 0
}
```

---

#### F. Soft-Deactivate Short Link
```bash
curl -X DELETE http://localhost:3000/api/v1/links/portfolio \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111"
```
**Expected Response (`HTTP 200 OK`)**:
```json
{
  "message": "Link deactivated"
}
```

---

#### G. Public Short URL 302 Redirect & Expiration Behavior
```bash
curl -i -X GET http://localhost:3000/s/portfolio
```
**Expected Response (`HTTP 302 Found` for active link)**:
```http
HTTP/1.1 302 Found
Location: https://example.com/updated-portfolio
```

**Expected Response (`HTTP 410 Gone` for deactivated or expired link)**:
```json
{
  "error": {
    "code": "LINK_EXPIRED",
    "message": "Short link has expired"
  }
}
```

---

#### H. List API Keys & Revoke Secondary API Key
```bash
# List API Keys
curl -X GET http://localhost:3000/api/v1/api-keys \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111"

# Revoke API Key
curl -X DELETE http://localhost:3000/api/v1/api-keys/41a3477a-af91-4977-b929-5ce0a91ad44f \
  -H "Authorization: Bearer sk_live_EXAMPLE_KEY_11111111111111111111111111111111"
```
**Expected Response for Revoke (`HTTP 200 OK`)**:
```json
{
  "message": "API key revoked successfully"
}
```

---

### 29.3 Standardized Error Envelopes

All API errors return a consistent JSON response structure:

```json
{
  "error": {
    "code": "ERROR_CODE_NAME",
    "message": "Human-readable description of error condition"
  }
}
```

#### Implemented HTTP Error Codes:

| Status Code | Error Code | Example Trigger Condition | Response Body |
| :--- | :--- | :--- | :--- |
| **`400 Bad Request`** | `INVALID_REQUEST` | Missing target URL or invalid payload / past expires_at | `{"error":{"code":"INVALID_REQUEST","message":"target_url must be a non-empty string"}}` |
| **`401 Unauthorized`** | `UNAUTHORIZED` | Missing, malformed, or revoked API key | `{"error":{"code":"UNAUTHORIZED","message":"Authentication required"}}` |
| **`404 Not Found`** | `NOT_FOUND` | Non-existent short code, key ID, or route | `{"error":{"code":"NOT_FOUND","message":"Short link not found"}}` |
| **`409 Conflict`** | `ALIAS_ALREADY_EXISTS` | Attempting to register an already taken custom alias | `{"error":{"code":"ALIAS_ALREADY_EXISTS","message":"The requested alias is already in use"}}` |
| **`410 Gone`** | `LINK_INACTIVE` / `LINK_EXPIRED` | Redirect attempt on soft-deactivated or expired link | `{"error":{"code":"LINK_EXPIRED","message":"Short link has expired"}}` |
| **`429 Rate Limited`** | `RATE_LIMIT_EXCEEDED` | Exceeding 60 link creations / min / user | `{"error":{"code":"RATE_LIMIT_EXCEEDED","message":"Too many link creation requests"}}` |
| **`500 Internal Error`** | `INTERNAL_SERVER_ERROR` | Unexpected application exception | `{"error":{"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}}` |
| **`503 Unavailable`** | `not_ready` status | Database connection lost or application shutting down (`GET /ready`) | `{"status":"not_ready"}` |

---

## 30. Production Operability & Observability (Step 20)

### 30.1 Request Correlation IDs (`X-Request-ID`)
All HTTP requests receive a standardized correlation ID header:
* Incoming `X-Request-ID` or `x-request-id` headers are validated against `^[A-Za-z0-9_-]{1,128}$`. Valid client headers are preserved; missing or invalid headers trigger creation of a new `crypto.randomUUID()`.
* Attached to `req.id` and echoed on all responses via `X-Request-ID: <uuid>`.
* Included in structured Pino log events (`request.completed`).

### 30.2 Health Probe Separation (`/health` vs `/ready`)
* **Liveness Probe (`GET /health`)**: Pure process liveness check (`HTTP 200 {"status":"ok","uptime":<seconds>}`). Does not execute database queries, preventing container restart flaps during transient DB lag.
* **Readiness Probe (`GET /ready`)**: Evaluates database reachability (`SELECT 1`) and process shutdown status. Returns `HTTP 200 {"status":"ready"}` when ready, or `HTTP 503 {"status":"not_ready"}` during shutdown or database failure.

### 30.3 Graceful Shutdown Readiness Drain
* On `SIGTERM` or `SIGINT`, the application enters shutdown mode (`isShuttingDown = true`).
* `GET /ready` immediately switches to `HTTP 503 {"status":"not_ready"}` to drain load balancer traffic.
* `server.close()` stops accepting new TCP connections while allowing in-flight requests to complete before closing the PostgreSQL pool cleanly.

### 30.4 Startup Environment Configuration Validation
Centralized validation via `src/config/env.js`:
* `PORT`: Validated as an integer between 1 and 65535.
* `NODE_ENV`: Bounded to `development`, `production`, or `test`.
* `DATABASE_URL`: Enforces valid URL parsing and `postgres://` or `postgresql://` schemes.
* `LOG_LEVEL`: Bounded to `debug`, `info`, `warn`, or `error`.
* `RATE_LIMIT_WINDOW_MS` & `RATE_LIMIT_MAX_REQUESTS`: Validated as positive finite integers.

---

## 31. Advanced Redirect Intelligence & Traffic Controls (Step 21)

Step 21 introduces a dynamic, rule-based traffic routing engine ([`src/services/routingEngine.js`](file:///d:/WebDev%20PROJECTS/tiny%20url/src/services/routingEngine.js)) evaluated at redirect time (`GET /s/:code`) without requiring external routing infrastructure.

### 31.1 Routing Configuration & Rule Types
Link owners can configure `routing_config` on link creation (`POST /api/v1/links`) or via updates (`PATCH /api/v1/links/:code`).

Supported rule types evaluated sequentially:
1. **Time Routing (`type: "time"`)**:
   * Directs traffic based on time of day (`start` and `end` in `HH:mm` format) in a specified IANA timezone (e.g. `America/New_York`, `UTC`).
   * Supports overnight time windows (e.g., `22:00` to `06:00`) and optional day filtering (`days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`).
2. **Device Routing (`type: "device"`)**:
   * Directs traffic based on client `User-Agent` headers parsed into categories (`mobile`, `tablet`, `desktop`, or `unknown`).
   * Evaluated via a deterministic heuristic without IP tracking, fingerprinting, or cookies.
3. **Weighted Routing (`type: "weighted"`)**:
   * Distributes traffic dynamically across multiple destinations (`destinations`: 2–10 targets).
   * Supports integer weights (1–100 each, total sum 1–1000) using CSPRNG cumulative interval selection (`crypto.randomInt`).

### 31.2 Payload Limits & Validation
* **Serialized JSON Limit**: `routing_config` maximum size of **16 KB**.
* **Rule Count Limit**: Maximum **10 rules** per link.
* **Target URLs**: Must be valid `http` or `https` URLs $\le 2048$ characters.
* **Time Windows**: `start` and `end` must be valid `HH:mm` timestamps. `start == end` is invalid and returns `HTTP 400 INVALID_REQUEST`.
* **Weighted Bounds**: 2 to 10 destinations; weight integer 1–100; total weight 1 to 1000.
* **Invalid Payloads**: Any schema violation, unknown rule type, or invalid property returns `HTTP 400 INVALID_REQUEST`.

### 31.3 PATCH Semantics & Cache Eviction
* **Object payload**: Replaces `routing_config` with validated object.
* **`null` payload**: Clears `routing_config` back to `null`.
* **Omitted key**: Leaves `routing_config` unchanged.
* **Cache Eviction**: Updating `routing_config` immediately purges the process-local LRU cache entry for the link.

### 31.4 Safe Fallback Behavior
* If rule evaluation encounters an unhandled runtime exception, the system safely logs the error with `requestId`, increments `routing_evaluation_errors_total`, and falls back to `link.target_url` with `HTTP 302 Found`.

---

## 32. License

A formal license has not yet been selected for this project. All rights reserved by the repository owner.
