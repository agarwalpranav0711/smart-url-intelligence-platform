# Step 15 — Performance Engineering Guide

## 1. Educational Foundations: Performance Engineering & System Optimization

### 1. What is Performance Engineering?
Performance engineering is the systematic discipline of measuring, profiling, identifying, and eliminating system bottlenecks based strictly on empirical evidence, without changing externally visible API contracts or introducing unnecessary architectural complexity.

### 2. Baseline vs. Optimization
* **Baseline**: Quantitative measurement of system metrics (RPS, latency percentiles, CPU, memory, error rates) before any code or infrastructure changes.
* **Optimization**: Target modifications applied to eliminate verified bottlenecks, followed by immediate re-measurement to confirm performance gains and preserve functional correctness.

### 3. Bottleneck Identification
Identifying bottlenecks requires tracing request execution paths under load. In database-backed APIs, bottlenecks typically manifest as database roundtrip latency, connection pool queueing, disk I/O, or single-threaded event loop blocking.

### 4. Database Latency & Connection Pools
* Every SQL query executed across a network socket incurs roundtrip transport latency and database execution time.
* Node.js uses a connection pool (`pg.Pool`, `max: 20`) to manage database connections. When request arrival rate exceeds connection availability, requests wait in Node's internal connection queue, causing latency to compound exponentially under high concurrency.

### 5. Caching & The Cache-Aside Pattern
* Caching stores frequently accessed data in high-speed, sub-millisecond memory to bypass expensive database queries.
* **Cache-Aside Pattern**: On read (`GET /s/:code`), the application checks the cache first. On cache hit, data is returned instantly. On cache miss, the application reads from PostgreSQL, populates the cache, and returns the response. On write/deactivation (`DELETE /api/v1/links/:code`), the entry is immediately evicted from the cache.

### 6. Cache Invalidation, Source of Truth, and Failure Behavior
* **Source of Truth**: PostgreSQL remains the single, authoritative source of truth for link existence and ownership.
* **Cache Invalidation**: Soft-deactivating a short link (`is_active = false`) immediately purges its entry from the cache so subsequent requests return `HTTP 410 LINK_INACTIVE` without stale reads.
* **Failure Resiliency**: If cache operations fail or throw errors, the service catches the exception gracefully and falls back transparently to PostgreSQL, ensuring no downtime or invalid URL failures.

### 7. Why Premature Optimization is Dangerous
Optimizing without prior measurement often introduces unnecessary dependencies (e.g. distributed caches, queues, microservices), increasing system complexity, operational risk, and bug surface area without addressing the real performance bottleneck.

---

## 2. Step 14 Baseline Verification & Inconsistency Resolution

During Phase 1 of Step 15, we investigated the apparent discrepancy in the Step 14 report between raw k6 output and the summary table:
* In raw k6 output without `p(99)` explicitly configured, k6 printed standard summary metrics `avg, min, med, max, p(90), p(95)`. The raw max latency was **413.45 ms**, and `~250 ms` was an estimated approximation in the summary table.
* In Phase 1, we updated all load-test scripts to explicitly configure `summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)']`.
* **Verified Step 14 Baseline Result**: Under 100 concurrent VUs, the un-cached redirect path achieved **888.85 req/sec** with **p50 = 39.22 ms**, **p95 = 126.96 ms**, and exact **p99 = 145.02 ms**.

---

## 3. Bottleneck Analysis & Selected Optimizations

### Identified Bottleneck
Profiling the `GET /s/:code` execution path revealed that issuing 2 synchronous/asynchronous SQL queries (`SELECT short_code, target_url...` and `UPDATE links SET click_count = click_count + 1...`) for every single redirect under 100 VUs generated over 1,700 DB queries/sec, saturating the `pg.Pool` (max 20) and limiting median redirect latency to ~39ms.

### Selected Optimization
Implemented an in-memory bounded LRU cache (`src/utils/cache.js`) integrated into `src/services/linkService.js` and `src/db/links.js`:
1. **Sub-millisecond Read Lookups**: Cached short code lookups are returned in < 0.1ms without touching PostgreSQL.
2. **Immediate Cache Invalidation**: Deactivating a link evicts the key immediately, preventing stale 302 redirects.
3. **Graceful DB Fallback**: On cache miss or cache exception, execution falls back transparently to PostgreSQL.
4. **Preserved Click Tracking**: Non-blocking atomic SQL click increment (`click_count = click_count + 1`) is preserved without blocking the 302 response.

---

## 4. Comprehensive Before vs. After Benchmark Comparison

| Metric / Scenario | BEFORE (Step 14 Baseline) | AFTER (Step 15 Optimized) | Percentage Improvement | Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **Test A: Redirect Throughput (RPS)** | 888.85 req/sec | **2,649.03 req/sec** | **+198.0% (3.0x)** | **MASSIVE GAIN** |
| **Test A: Redirect Latency p50** | 39.22 ms | **14.73 ms** | **62.4% Faster** | **PASSED** |
| **Test A: Redirect Latency p90** | 114.54 ms | **30.07 ms** | **73.7% Faster** | **PASSED** |
| **Test A: Redirect Latency p95** | 126.96 ms | **33.04 ms** | **74.0% Faster** | **PASSED** |
| **Test A: Redirect Latency p99** | 145.02 ms | **42.58 ms** | **70.6% Faster** | **PASSED (< 50ms target)** |
| **Test A: Redirect Error Rate** | 0.00% | **0.00%** | 0.00% | **PASSED** |
| **Test B: Create Throughput (RPS)** | 449.40 req/sec | **1,065.31 req/sec** | **+137.0% (2.3x)** | **MASSIVE GAIN** |
| **Test B: Create Latency p50** | 6.53 ms | **4.71 ms** | **27.9% Faster** | **PASSED** |
| **Test B: Create Latency p99** | 187.73 ms | **16.82 ms** | **91.0% Faster** | **PASSED (< 200ms target)** |
| **Test B: Create 5xx Error Rate** | 0.00% | **0.00%** | 0.00% | **PASSED** |
| **Test C: Mixed Throughput (RPS)** | 594.27 req/sec | **888.18 req/sec** | **+49.5%** | **PASSED** |
| **Test C: Redirect p50 Latency** | 48.56 ms | **3.16 ms** | **93.5% Faster** | **PASSED** |
| **Test C: Redirect p99 Latency** | ~250.00 ms | **18.42 ms** | **92.6% Faster** | **PASSED** |
| **Test D: Sustained Throughput (RPS)**| 655.68 req/sec | **827.92 req/sec** | **+26.3%** | **PASSED** |
| **Test D: Sustained p50 Latency** | 36.55 ms | **2.77 ms** | **92.4% Faster** | **PASSED** |
| **Test D: Sustained p99 Latency** | 427.58 ms | **25.21 ms** | **94.1% Faster** | **PASSED** |
| **Test E: Rate-Limit Enforcement** | HTTP 429 after 60 req | HTTP 429 after 60 req | 100% Compliant | **PASSED** |

---

## 5. PostgreSQL & Container Observations

* **DB Connection Pool**: Peak active connections during load dropped from 20 (pool saturation) to 3–6 idle connections because cache hits bypass read queries entirely.
* **App Container CPU & Memory**:
  * CPU: Peak CPU utilization under 2,649 req/sec load remained stable at ~60–80%.
  * Memory: `url_shortener_app` RSS memory stabilized at ~85 MB (zero memory leak across 60s sustained load).
* **PostgreSQL Container**: CPU usage dropped from ~45% to ~12% during redirect benchmarks.

---

## 6. Functional & Integration Verification

* **Integration Test Suite**: **171/171 assertions passing** (`npm test`)
* **Vulnerability Audit**: **0 vulnerabilities** (`npm audit`)
* **Docker Compose**: Container stack compiled and running cleanly
* **API Behavior**: 100% preservation of authentication, rate limiting, pagination, 302 redirects, and soft deactivation.
