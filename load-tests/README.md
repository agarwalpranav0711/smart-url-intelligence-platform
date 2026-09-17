# Load Testing Suite — Smart URL Intelligence Platform

This directory contains the load-testing harness and reproducible benchmark scenarios for the Smart URL Intelligence Platform MVP.

---

## 1. Load Testing Tool Selection

**Tool Selected**: [Grafana k6](https://k6.io/) (v2.2.0 / `grafana/k6:latest`)

### Rationale:
1. **Lightweight & Container Native**: Runs cleanly via standard Docker (`docker run --rm -v ... grafana/k6 run ...`) without polluting the Node.js application environment or requiring binary compilation.
2. **Realistic VU Orchestration**: Supports Virtual Users (VUs), multi-stage ramping schedules (`ramping-vus`), constant load (`constant-vus`), and fixed-iteration rate testing (`per-vu-iterations`).
3. **Accurate Percentile Metrics**: Calculates precise request rates (RPS), error rates, average latency, and percentiles (p50, p90, p95, p99).
4. **Declarative Scenario Verification**: Integrates custom status counters and assertions without altering application logic.

---

## 2. Test Setup & Data Provisioning

Before executing load tests against a running Docker stack, generate test credentials and short codes:

```bash
# Ensure Docker stack is running
docker compose up -d

# Provision test user and short codes
node scripts/setup-load-test-data.js
```

The setup script creates:
- A load-test developer user via `POST /api/v1/users`
- 5 short links via `POST /api/v1/links`
- Configuration stored in `load-tests/test-config.json` and `.env.test` (both git-ignored)

> ⚠️ **SECURITY WARNING**: Load-test credentials and API keys are stored only in environment variables and local ignored config files. They are NEVER committed or logged.

---

## 3. Test Scenarios & Execution Commands

Run tests from the repository root:

### Test A: Public Redirect Read Load (`GET /s/:code`)
Measures maximum redirect throughput and latency percentiles under ramping VU load (up to 100 VUs).
```bash
docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/redirect.js
```

### Test B: Link Creation Write Load (`POST /api/v1/links`)
Measures authenticated link creation throughput, latency, and rate-limiting behavior.
```bash
docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/create.js
```

### Test C: Mixed Workload (100 Redirects : 1 Link Creation)
Approximates standard system workload (99% reads, 1% writes) over 50 ramping VUs.
```bash
docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/mixed.js
```

### Test D: Sustained Moderate Load (60-second test)
Runs a steady 30 VU workload for 60 seconds to detect latency drift, connection pool exhaustion, memory growth, or database instability.
```bash
docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/sustained.js
```

### Test E: Rate-Limit Validation
Sends 75 rapid creation requests for a single user to explicitly verify HTTP 429 returns on request 61+.
```bash
docker run --rm -v "${PWD}/load-tests:/load-tests" --add-host=host.docker.internal:host-gateway grafana/k6 run /load-tests/rate-limit.js
```

---

## 4. Container Resource & DB Monitoring

During load tests, observe container resource consumption and active PostgreSQL connections:

```bash
# Monitor container CPU & Memory
docker stats url_shortener_app url_shortener_db

# Check PostgreSQL active connection pool
docker exec url_shortener_db psql -U postgres -d url_shortener -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```
