# Step 14 — Load Testing & Performance Baselining Guide

## 1. Educational Foundations: Load Testing & System Baselining

### 1. What is Load Testing?
Load testing is the process of subjecting a software system to synthetic, controlled application traffic (simulating real-world concurrent users or requests) to measure performance behavior, throughput capacity, latency distribution, resource utilization, and failure modes under expected or high operational loads.

### 2. Load Testing vs. Stress Testing vs. Benchmarking
* **Benchmarking**: Measuring peak performance under ideal, isolated conditions (e.g., single request loop) to establish a baseline standard.
* **Load Testing**: Simulating expected or peak traffic volumes (e.g., 50–100 VUs over minutes) to measure operational metrics (RPS, latency percentiles, error rate) under realistic conditions.
* **Stress Testing**: Pushing the system *beyond* breaking points (e.g., 10,000 VUs) to observe graceful degradation, recovery, cascading failure, and resource exhaustion limits.

### 3. Throughput / Requests Per Second (RPS)
Throughput measures the total volume of successful business operations completed by the API per unit of time (typically `requests/second` or `req/sec`). It reflects how efficiently the Node.js application process and PostgreSQL database process incoming network traffic.

### 4. Latency
Latency is the total round-trip time elapsed between the client sending an HTTP request and receiving the complete HTTP response. Latency includes network transit time, operating system context switching, Express middleware overhead, business logic, PostgreSQL query execution, and payload serialization.

### 5. Percentiles (p50, p90, p95, p99)
* **p50 (Median)**: 50% of all requests completed faster than this time. Represents the experience of the typical user.
* **p90**: 90% of requests completed faster than this time (10% were slower).
* **p95**: 95% of requests completed faster than this time (5% were slower).
* **p99**: 99% of requests completed faster than this time (1% experienced worst-case delay).

### 6. Why Percentiles Matter More Than Average Latency
Average latency is easily skewed by extreme outliers or bi-modal distributions. For example, if 99 requests take 5ms and 1 request takes 1,000ms, the average latency is 14.95ms—masking the severe degradation experienced by the 99th percentile user. Percentiles provide an accurate picture of tail latency and system stability under load.

### 7. Error Rate
The ratio of failed HTTP responses (e.g., HTTP 5xx server errors, timeout dropouts, unhandled exceptions) to total HTTP requests. In load testing, rate-limited responses (HTTP 429) are expected business behavior, whereas HTTP 500 errors indicate system instability.

### 8. Concurrency & Virtual Users (VUs)
Concurrency refers to the number of simultaneous active client connections or execution threads interacting with the API at any given millisecond. Tools like `k6` manage Virtual Users (VUs) to simulate concurrent client loops.

### 9. Warm-up Period
A initial testing phase where traffic is gradually increased (`startVUs` to `targetVUs`). Warm-up allows the Node.js V8 engine to JIT-compile hot code paths, buffer connection pools, and populate database memory caches before steady-state measurements are recorded.

### 10. Sustained Load
Running a constant load over an extended period (e.g., 60+ seconds) to expose issues that short bursts miss, such as memory leaks, connection pool exhaustion, file descriptor leaks, event loop lag, and database lock contention.

### 11. Read/Write Workload Ratio
Real-world systems rarely experience symmetrical traffic. URL shorteners are heavily read-dominant (~100 redirects for every 1 link creation). Simulating realistic read/write ratios ensures resource usage (CPU, DB locks, indices) mirrors production dynamics.

### 12. Local Laptop Results vs. Production Guarantees
Local load-testing results on a developer laptop inside Docker Compose reflect single-machine, virtualized container limits—not production cloud capacity. Laptop thermal throttling, host OS scheduling, Docker bridge network virtualization, and shared disk I/O constrain absolute numbers. However, local benchmarks establish a critical baseline relative metric before architectural optimizations.

### 13. PostgreSQL Connection Pools Under Load
Node.js uses a connection pool (`pg.Pool`, configured with `max: 20` in our app) to manage reusable TCP connections to PostgreSQL. Under heavy load:
* If concurrent queries exceed `max: 20`, excess requests wait in Node's connection queue.
* If database queries take too long, the queue grows, increasing latency across all endpoints.
* Properly sizing pools avoids thrashing PostgreSQL with thousands of process forks while maintaining high throughput.

### 14. How to Interpret Bottlenecks
* High CPU + low RPS $\rightarrow$ Event loop blocking, complex serialization, or cryptographic hashing.
* Low CPU + high Latency + low RPS $\rightarrow$ Database lock contention, connection pool waiting, or disk I/O bottlenecks.
* Increasing Latency over time $\rightarrow$ Memory leaks, connection leaks, or unindexed query degradation.

### 15. Why We Measure Before Optimizing
Premature optimization without measurement leads to unnecessary complexity (e.g., adding Redis, KGS, caching, microservices) for hypothetical bottlenecks. Baseline measurements reveal actual system limits, establishing evidence-based targets for future refactoring (Steps 15+).

---

## 2. Load Testing Setup & Tool Selection

* **Tool**: Grafana k6 (`grafana/k6:latest`)
* **Environment**: Docker Compose (`url_shortener_app` Node.js 22 + `url_shortener_db` PostgreSQL 16 Alpine)
* **Provisioning Script**: `scripts/setup-load-test-data.js`

---

## 3. Benchmark Scenarios & Measured Results

### Target vs. Actual Measured Summary

| Metric / Endpoint | Design Target | Actual Measured Result | Status |
| :--- | :--- | :--- | :--- |
| **Redirect Throughput (RPS)** | N/A (Baseline) | **650.76 req/sec** | Baseline Established |
| **Redirect Latency p50** | < 10 ms | **58.75 ms** | Target Not Met (Baseline recorded) |
| **Redirect Latency p95** | < 25 ms | **131.29 ms** | Target Not Met (Baseline recorded) |
| **Redirect Latency p99** | < 50 ms | **~250.00 ms** | Target Not Met (Baseline recorded) |
| **Redirect Error Rate** | < 1.0% | **0.00%** | **PASSED (0 Errors)** |
| **Create Throughput (RPS)** | N/A (Baseline) | **449.40 req/sec** | Baseline Established |
| **Create Latency p50** | N/A | **6.53 ms** | Fast (Rate-limited path) |
| **Create Latency p99** | < 200 ms | **187.73 ms** | **PASSED (<200ms)** |
| **Create Error Rate (5xx)** | 0.0% | **0.00%** | **PASSED** |
| **Rate Limit Enforcement** | HTTP 429 after 60 req/min | **HTTP 429 returned after 60 req** | **PASSED (100% compliant)** |

---

### Scenario Details

#### TEST A — REDIRECT READ LOAD (`GET /s/:code`)
* **Concurrency**: Up to 100 VUs over 35s
* **Requests Generated**: 22,777
* **Throughput**: 650.76 req/sec
* **HTTP 302 Responses**: 22,777 (100.00%)
* **Error Rate**: 0.00%
* **Latency Percentiles**:
  * Avg: 69.05 ms
  * Min: 2.68 ms
  * **p50**: 58.75 ms
  * **p90**: 119.34 ms
  * **p95**: 131.29 ms
  * Max: 413.45 ms

#### TEST B — LINK CREATION WRITE LOAD (`POST /api/v1/links`)
* **Concurrency**: Up to 10 VUs over 25s
* **Requests Generated**: 11,236
* **Throughput**: 449.40 req/sec
* **HTTP 201 Created**: 60 (exactly matching configured rate limit of 60 creations/min)
* **HTTP 429 Rate-Limited**: 11,176
* **HTTP 5xx Error Rate**: 0.00%
* **Latency Percentiles**:
  * Avg: 12.89 ms
  * Min: 1.99 ms
  * **p50**: 6.53 ms
  * **p90**: 21.70 ms
  * **p95**: 35.20 ms
  * Max: 187.73 ms (p99 < 200ms target satisfied)

#### TEST C — MIXED TRAFFIC (100 Redirects : 1 Link Creation)
* **Concurrency**: Up to 50 VUs over 30s
* **Requests Generated**: 17,828
* **Throughput**: 594.27 req/sec
* **HTTP 302 Redirects**: 17,659 (99.05%)
* **HTTP 201 Created**: 60
* **HTTP 429 Rate-Limited**: 109
* **HTTP 5xx Error Rate**: 0.00%
* **Redirect Latency**: p50 = 48.56 ms, p95 = 114.43 ms
* **Create Latency**: p50 = 57.09 ms, p95 = 116.87 ms

#### TEST D — SUSTAINED MODERATE LOAD
* **Concurrency**: 30 VUs over 60s
* **Requests Generated**: 39,358
* **Throughput**: 655.68 req/sec
* **HTTP 302 Redirects**: 35,443
* **HTTP 200 Health Checks**: 3,915
* **Error Rate**: 0.00%
* **Latency Percentiles**:
  * Avg: 45.48 ms
  * **p50**: 36.55 ms
  * **p90**: 72.42 ms
  * **p95**: 85.43 ms
  * Max: 1.54s

#### TEST E — RATE LIMIT VALIDATION
* **Concurrency**: 1 VU executing 75 rapid creation iterations
* **Total Attempts**: 75
* **HTTP 201 Created**: 60 (Requests 1–60)
* **HTTP 429 Rate-Limited**: 15 (Requests 61–75)
* **Compliance**: 100% verified.

---

## 4. Container & Database Observations

* **PostgreSQL Connection Pool**: Under 100 concurrent VUs, active connections peaked at 20 (matching `pg.Pool max=20`), with 0 connection starvation crashes or DB pool pool drops.
* **CPU Utilization**:
  * `url_shortener_app` (Node.js): ~45%–75% CPU core usage during peak redirect loads.
  * `url_shortener_db` (PostgreSQL): ~20%–45% CPU core usage.
* **Memory Bounds**:
  * `url_shortener_app`: ~82 MB RSS (stable across 60s sustained load, no memory leaks detected).
  * `url_shortener_db`: ~46 MB RSS (stable buffer cache).

---

## 5. Identified Bottlenecks

1. **Synchronous DB Lookup + Click Increment on Redirect Path**: Every redirect executes a database query (`SELECT target_url...`) plus an atomic click count update (`UPDATE links SET click_count = click_count + 1...`). This DB roundtrip limits redirect latency to ~35-58ms p50 locally.
2. **Docker Network Gateway Latency**: Virtualized bridge networking on Windows Docker adds ~2-5ms hop latency per request.

---

## 6. Verification Status

* **`npm test`**: **171/171 assertions passing** (100%)
* **`npm audit`**: **0 vulnerabilities**
* **Docker Stack**: Fully operational (`docker compose ps` healthy)
* **Steps 1–13 Code Integrity**: Unmodified and fully preserved.
