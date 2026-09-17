# Step 12 — Docker Containerization & Deployment Readiness Guide

## 1. Executive Summary

Step 12 containerizes the **Smart URL Intelligence Platform MVP** using Docker and Docker Compose. This provides a self-contained, multi-container environment where both the Node.js/Express application and the PostgreSQL database start reproducibly with a single command (`docker compose up --build -d`), without altering existing application business logic or API contracts.

---

## 2. System Architecture

### Before Docker:
```
Host Workstation (Node.js App process) ──(localhost:5432)──> Host PostgreSQL
```

### After Docker (Docker Compose Orchestration):
```
                        Host Machine (Developer Workstation)
                                       │
                         http://localhost:3000 (API)
                                       │
  ┌────────────────────────────────────┼──────────────────────────────────┐
  │ Docker Compose Network: url_shortener_default                        │
  │                                    ▼                                  │
  │                      ┌───────────────────────────┐                    │
  │                      │   url_shortener_app       │                    │
  │                      │    Node.js 22 (Alpine)    │                    │
  │                      └─────────────┬─────────────┘                    │
  │                                    │                                  │
  │                 DATABASE_URL=postgres://...@postgres:5432/...         │
  │                                    ▼                                  │
  │                      ┌───────────────────────────┐                    │
  │                      │    url_shortener_db       │                    │
  │                      │       PostgreSQL 16       │                    │
  │                      └─────────────┬─────────────┘                    │
  └────────────────────────────────────┼──────────────────────────────────┘
                                       │
                                       ▼
                       Docker Volume: postgres_data
```

---

## 3. Docker Specifications & Design Rationale

### A. [`Dockerfile`](file:///d:/WebDev%20PROJECTS/tiny%20url/Dockerfile)
* **Base Image**: `node:22-alpine` (Minimal, security-hardened Alpine Linux environment matching Node.js 22 LTS runtime).
* **Layer Caching**: `package.json` and `package-lock.json` are copied first and installed via `npm ci` before copying source code. This prevents unnecessary dependency reinstalls when application code changes.
* **Non-Root Execution**: Runs under process ownership `USER node` with permissions scoped via `chown -R node:node /app`.
* **Exposed Port**: `3000`.
* **Command**: `CMD ["npm", "start"]` (`node src/app.js`).

### B. [`.dockerignore`](file:///d:/WebDev%20PROJECTS/tiny%20url/.dockerignore)
Excludes host dependencies (`node_modules`), secret files (`.env`), `.git`, test artifacts (`coverage`), and temporary logs (`scratch`, `*.log`) from the Docker build context.

### C. [`docker-compose.yml`](file:///d:/WebDev%20PROJECTS/tiny%20url/docker-compose.yml)
* **Service 1 (`postgres`)**:
  - Image: `postgres:16-alpine`.
  - Environment: `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=url_shortener`.
  - Persistent Volume: `postgres_data:/var/lib/postgresql/data`.
  - Schema Auto-Init: `./schema.sql:/docker-entrypoint-initdb.d/01_schema.sql:ro`.
  - Healthcheck: `pg_isready -U postgres -d url_shortener` (Interval: 5s, Timeout: 5s, Retries: 5).
* **Service 2 (`app`)**:
  - Ports: `3000:3000`.
  - Environment: `NODE_ENV=production`, `PORT=3000`, `DATABASE_URL=postgres://postgres:postgres@postgres:5432/url_shortener`.
  - Dependency: `depends_on.postgres.condition = service_healthy` (ensures database is ready before app boots).

---

## 4. Database Schema Initialization & Persistence Mechanics

### Schema Auto-Initialization (`/docker-entrypoint-initdb.d/`)
* **Fresh Data Directory**: When Docker Compose creates a new volume, official PostgreSQL image scripts execute `/docker-entrypoint-initdb.d/01_schema.sql` to initialize tables (`users`, `api_keys`, `links`) and B-Tree indexes.
* **Persistent Volume Protection**: When restarting containers or running `docker compose down` followed by `docker compose up -d`, PostgreSQL detects an existing data directory and **skips** initialization scripts. This prevents `schema.sql` from re-running or dropping active persistent data.

### Persistent Volume (`postgres_data`)
* Container filesystems are ephemeral (destroyed when a container is removed).
* Mounting `postgres_data:/var/lib/postgresql/data` stores PostgreSQL database files on a managed Docker host volume, preserving developer accounts, API keys, links, and click counts across container removal and recreation.

---

## 5. Educational Learning Concepts

| Concept | Explanation & Project Context |
| :--- | :--- |
| **Image vs. Container** | An **Image** (`Dockerfile` output) is an immutable read-only blueprint containing application code and Node.js 22 runtime. A **Container** is a running, isolated process instance created from that image. |
| **Dockerfile vs. Docker Compose** | `Dockerfile` defines how to build a single container image (`app`). `docker-compose.yml` orchestrates multi-container applications (`app` + `postgres` database + network + volume). |
| **Localhost inside Containers** | Inside the `app` container, `localhost` refers to the container's own isolated loopback network, **not** the host machine or database. Containers communicate over the Docker network using service names (`postgres:5432`). |
| **Persistent Volume vs. Ephemeral Storage** | Container file changes are lost when a container is deleted. Docker Volumes (`postgres_data`) store database data outside container lifecycles. |
| **`docker compose down` vs `down -v`** | `docker compose down` stops and removes containers while keeping database data intact. `docker compose down -v` deletes containers **AND** the named volume (`postgres_data`), resetting the local database. |
| **Dependency Readiness Healthchecks** | `depends_on` alone only waits for the database process to start. Adding `service_healthy` + `pg_isready` ensures Express starts **after** PostgreSQL can accept database queries. |

---

## 6. Operation Commands & Lifecycle Guide

### Start the Multi-Container Stack:
```bash
docker compose up --build -d
```

### Check Container Status & Health:
```bash
docker compose ps
```

### View Application Logs:
```bash
docker compose logs -f app
```

### Stop Containers (Preserving Data):
```bash
docker compose down
```

### Reset Local Database (Destructive Reset):
```bash
docker compose down -v
```

---

## 7. Empirical Operational Verification Evidence

### A. Host Baseline Verification:
* `npm test`: **171/171 assertions passing (100% success)**.
* `npm audit`: **0 vulnerabilities (clean dependency tree)**.
* `git status --short`: `.env` is strictly ignored; 0 secrets committed.

### B. Stack Initialization & Container Health:
```bash
$ docker compose up --build -d
# Output:
Network tinyurl_default Creating & Created
Volume "tinyurl_postgres_data" Creating & Created
Container url_shortener_db Starting & Healthy
Container url_shortener_app Starting & Started

$ docker compose ps
NAME                IMAGE                COMMAND                  SERVICE    STATUS                    PORTS
url_shortener_app   tinyurl-app          "docker-entrypoint.s…"   app        Up 8 seconds              0.0.0.0:3000->3000/tcp
url_shortener_db    postgres:16-alpine   "docker-entrypoint.s…"   postgres   Up 14 seconds (healthy)   0.0.0.0:5432->5432/tcp
```

### C. Application Logs & Health/Metrics Verification:
```bash
$ docker compose logs app
url_shortener_app | {"level":30,"time":"...","event":"server.started","port":"3000"}

$ curl http://localhost:3000/health
HTTP 200 OK -> { "status": "ok" }

$ curl http://localhost:3000/metrics
HTTP 200 OK ->
link_creations_total        : 0
redirects_total             : 0
redirect_not_found_total    : 0
redirect_inactive_total     : 0
deactivations_total         : 0
rate_limit_exceeded_total   : 0
api_keys_created_total      : 0
api_keys_revoked_total      : 0
api_key_auth_failures_total : 0
```

### D. Complete Containerized API Lifecycle Test:
1. **User Registration (`POST /api/v1/users`)**:
   - Request: `{ "email": "docker_user@example.com" }`
   - Response: `HTTP 201 Created` -> `{ "user_id": "785f9593-c5c0-438c-ab1f-8bfc337a0bf1", "key_id": "bdbf37df-f29c-44af-b581-9b727fc95448", "api_key": "YOUR_PRIMARY_API_KEY" }`
2. **Short Link Creation (`POST /api/v1/links`)**:
   - Header: `Authorization: Bearer YOUR_PRIMARY_API_KEY`
   - Request: `{ "target_url": "https://example.com/docker-test" }`
   - Response: `HTTP 201 Created` -> `{ "short_code": "mvxocA", "target_url": "https://example.com/docker-test" }`
3. **List Links (`GET /api/v1/links`)**:
   - Header: `Authorization: Bearer YOUR_PRIMARY_API_KEY`
   - Response: `HTTP 200 OK` -> `short_code: "mvxocA"`, `click_count: 0`, `is_active: true`
4. **Public Redirect (`GET /s/mvxocA`)**:
   - Response: `HTTP 302 Found` -> `Location: https://example.com/docker-test`
5. **Verify Click Increment (`GET /api/v1/links`)**:
   - Response: `HTTP 200 OK` -> `short_code: "mvxocA"`, `click_count: 1`
6. **Soft Deactivation (`DELETE /api/v1/links/mvxocA`)**:
   - Header: `Authorization: Bearer YOUR_PRIMARY_API_KEY`
   - Response: `HTTP 200 OK` -> `{ "message": "Link deactivated" }`
7. **Verify Deactivated Redirect (`GET /s/mvxocA`)**:
   - Response: `HTTP 410 Gone`
8. **Create Secondary Key (`POST /api/v1/api-keys`)**:
   - Header: `Authorization: Bearer YOUR_PRIMARY_API_KEY`
   - Request: `{ "name": "Key to Revoke" }`
   - Response: `HTTP 201 Created` -> `key_id: "1874f18e-c5d9-41cc-92fe-eae313102e22"`, `api_key: "YOUR_SECONDARY_API_KEY"`
9. **Revoke Key (`DELETE /api/v1/api-keys/1874f18e-c5d9-41cc-92fe-eae313102e22`)**:
   - Header: `Authorization: Bearer YOUR_PRIMARY_API_KEY`
   - Response: `HTTP 200 OK` -> `{ "message": "API key revoked successfully" }`
10. **Verify Revoked Key Rejection (`GET /api/v1/links`)**:
    - Header: `Authorization: Bearer YOUR_SECONDARY_API_KEY`
    - Response: `HTTP 401 Unauthorized`

### E. Named-Volume Persistence & Schema Script Safeguard Test:
1. **Created Test Link**: `POST /api/v1/links` -> `short_code: "Jx4c12"`, `target_url: "https://example.com/persistent-test-link"`.
2. **Container Removal**: `docker compose down` (stopped and removed `url_shortener_app` and `url_shortener_db` containers and network).
3. **Container Recreation**: `docker compose up -d` (recreated container stack).
4. **PostgreSQL Log Verification (`docker compose logs postgres`)**:
   ```
   url_shortener_db | PostgreSQL Database directory appears to contain a database; Skipping initialization
   url_shortener_db | LOG: database system is ready to accept connections
   ```
   *Confirms PostgreSQL initialization scripts (`schema.sql`) were skipped and never re-executed over existing persistent volume.*
5. **Data Survival Verification**:
   - `GET /api/v1/links` -> Both `Jx4c12` and `mvxocA` links intact.
   - `GET /s/Jx4c12` -> `HTTP 302 Found` -> `Location: https://example.com/persistent-test-link`.
6. **Named Volume Listing (`docker volume ls`)**:
   - Confirmed `tinyurl_postgres_data` volume exists.

### F. Container Restart & Failure Recovery Test:
- Executed `docker compose restart postgres`.
- Re-queried application: `GET /health` returned `status: "ok"` and `GET /api/v1/links` returned `LinksCount: 2`. Confirms application automatically reconnects after database restart.

---

## 8. Production Deployment Disclaimer & Future Considerations

Dockerizing the application locally provides reproducible development and deployment artifacts, but does **not** equal production cloud readiness.

### Post-MVP Production Considerations:
* **Production Secrets Management**: Use AWS Secrets Manager, HashiCorp Vault, or Kubernetes Secrets instead of plain compose environment variables.
* **Managed Database**: Use managed PostgreSQL (AWS RDS, GCP Cloud SQL) rather than running PostgreSQL inside a container in production.
* **TLS / HTTPS Termination**: Deploy an NGINX reverse proxy, Cloudflare, or AWS ALB to terminate HTTPS certificates.
* **High Availability & Backups**: Configure automated PostgreSQL automated snapshots, WAL archiving, and failover replicas.
* **Centralized Logging & Monitoring**: Ship Pino JSON logs to Datadog/Grafana Loki and ingest Prometheus metrics.
