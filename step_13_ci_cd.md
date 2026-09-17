# Step 13 — CI/CD with GitHub Actions Documentation

## 1. Executive Summary

Step 13 implements automated **Continuous Integration (CI)** for the **Smart URL Intelligence Platform MVP** using GitHub Actions (`.github/workflows/ci.yml`). Every code push and pull request to the `main` or `master` branches automatically triggers a clean build, provisions an ephemeral PostgreSQL 16 service container, executes the full 171-assertion integration test suite, verifies zero security vulnerabilities (`npm audit`), and compiles the Docker production image.

---

## 2. Core Concepts: CI vs. CD

### Continuous Integration (CI)
* **Definition**: The automated practice of frequently integrating code changes from multiple developers into a shared repository, running automated builds, tests, and security checks on every commit.
* **Purpose**: Detect bugs, regressions, syntax errors, breaking API changes, and security vulnerabilities immediately after code is written, before it reaches production or is merged into `main`.

### Continuous Delivery & Deployment (CD)
* **Continuous Delivery**: Automatically preparing and packaging validated code artifacts (e.g., building and tagging Docker images) so they are ready for deployment at any moment with a single manual trigger.
* **Continuous Deployment**: Automatically deploying every validated commit directly to staging or production cloud environments without human intervention.

> [!NOTE]
> **Step 13 Focus**: Step 13 implements **Continuous Integration (CI)** and **Build Delivery Verification**. Automated cloud deployment (Continuous Deployment) is intentionally excluded at the MVP stage to prevent unwanted infrastructure costs or unintended production deployments.

---

## 3. GitHub Actions Pipeline Architecture

```
                    Developer Push / Pull Request to 'main'
                                      │
                                      ▼
                       GitHub Actions Runner (Ubuntu)
   ┌──────────────────────────────────┴──────────────────────────────────┐
   │ Ephemeral Service Container: postgres:16-alpine                      │
   │ Healthcheck: pg_isready (5432:5432)                                 │
   └──────────────────────────────────┬──────────────────────────────────┘
                                      │
 1. Checkout Repository (actions/checkout@v4)
                                      │
 2. Setup Node.js 22 Runtime + npm cache (actions/setup-node@v4)
                                      │
 3. Install Production & Dev Dependencies (npm ci)
                                      │
 4. Run Database Schema Migration (npm run setup-db)
    DATABASE_URL=postgres://postgres:postgres@localhost:5432/url_shortener
                                      │
 5. Execute Integration Test Suite (npm test) -> 171/171 Assertions
                                      │
 6. Run Security Vulnerability Audit (npm audit) -> 0 Vulnerabilities
                                      │
 7. Verify Docker Image Compilation (docker build -t tinyurl-app:latest .)
                                      │
                                      ▼
                        ✅ Build Success / ❌ Build Failure
```

---

## 4. Pipeline Jobs & Workflow Steps Breakdown

The workflow file [`.github/workflows/ci.yml`](file:///d:/WebDev%20PROJECTS/tiny%20url/.github/workflows/ci.yml) defines a single job `test-and-build` executed on `ubuntu-latest`.

### A. PostgreSQL Service Container (`services.postgres`)
* **Image**: `postgres:16-alpine` (Matches local dev & Docker Compose version).
* **Environment**: `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=url_shortener`.
* **Port Binding**: `5432:5432` mapped to GitHub Actions runner host network.
* **Healthcheck**: `--health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5` ensures PostgreSQL is fully booted before Node.js steps begin.

### B. Step-by-Step Execution Sequence

1. **Checkout Code (`actions/checkout@v4`)**:
   Fetches repository source code into the GitHub Actions virtual runner workspace.

2. **Setup Node.js 22 Environment (`actions/setup-node@v4`)**:
   Installs Node.js 22 runtime and enables automatic caching for `~/.npm` based on `package-lock.json` hash to accelerate build speeds.

3. **Clean Dependency Installation (`npm ci`)**:
   Installs exact package versions specified in `package-lock.json` in a clean, reproducible manner without modifying the lockfile.

4. **Database Migration (`npm run setup-db`)**:
   Connects to `postgres://postgres:postgres@localhost:5432/url_shortener` and executes `schema.sql` to create `users`, `api_keys`, and `links` tables and B-Tree indexes.

5. **Integration Test Suite (`npm test`)**:
   Executes `node test/integration.js`, running all 171 integration assertions (Steps 3–11) against the live CI PostgreSQL service container.

6. **Security Vulnerability Audit (`npm audit`)**:
   Scans installed dependencies against the GitHub Advisory Database for known security vulnerabilities.

7. **Docker Build Verification (`docker build -t tinyurl-app:latest .`)**:
   Compiles `Dockerfile` to confirm production image packaging succeeds cleanly without pushing to Docker Hub or remote registries.

---

## 5. Security Isolation & Environment Configuration

* **Zero Hard-Coded Production Secrets**: `ci.yml` uses local service container credentials (`postgres:postgres`) scoped strictly to the runner's ephemeral environment.
* **No `.env` Dependency**: CI runs entirely without requiring developer `.env` files. `.gitignore` ensures local `.env` is never committed.
* **Environment Variable Injection**: `DATABASE_URL` is passed directly in job step context:
  ```yaml
  env:
    DATABASE_URL: postgres://postgres:postgres@localhost:5432/url_shortener
  ```

---

## 6. Pipeline Failure Mechanics & Status Badges

If any step in the pipeline fails (e.g., a failing test assertion, database syntax error, missing dependency, security vulnerability, or broken Dockerfile syntax):
* The GitHub Actions job immediately terminates with a non-zero exit code.
* The Pull Request or commit displays a red ❌ build failure indicator.
* Pull requests can be configured with GitHub branch protection rules to block merging broken code into `main`.

---

## 7. What is Intentionally NOT Automated Yet (CD Scope)

The following deployment & distribution tasks are intentionally omitted at Step 13:
* **Image Registry Publishing**: Docker images are not pushed to Docker Hub or GitHub Container Registry (GHCR).
* **Cloud Deployment**: No automatic deployments to AWS RDS/ECS, GCP Cloud Run, or Kubernetes.
* **Production Secret Injection**: No integration with AWS Secrets Manager or HashiCorp Vault.
* **Load Testing & Stress Testing**: Performance load benchmarks are left for Step 14.

---

## 8. Summary of Verification

* `npm test`: **171/171 assertions passing (100%)**.
* `npm audit`: **0 vulnerabilities**.
* `docker build`: **Image `tinyurl-app:latest` built successfully**.
* `git status`: **`.env` strictly ignored**.
