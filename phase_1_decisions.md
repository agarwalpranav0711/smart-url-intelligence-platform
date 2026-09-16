# Smart URL Intelligence Platform
## Phase 1 — Final Locked Decision Summary

---

## 1. Locked P0 MVP Decisions

1. **Target User**: Developers & API Consumers (Programmatic REST JSON API).
2. **Creator Authentication**: Mandatory Bearer API Key Header (`Authorization: Bearer <key>`) for `POST /links`, `GET /links`, `DELETE /links`.
3. **Redirect Visitor Access**: 100% Anonymous & Unauthenticated (`GET /s/:code` returns HTTP 302 Found).
4. **Duplicate Handling**: Always generate a new unique short code per creation request (guarantees tenant isolation).
5. **Link Mutability**: Links are **strictly immutable in V1 MVP**. URL Editing (`PUT /api/v1/links/:code`) is moved to P1.
6. **Custom Aliases & Expiration (TTL)**: Postponed to **P1 (V2 Core)**. V1 MVP focuses purely on Base62 random short codes without TTL cleanup overhead.
7. **Analytics Scope**: **Atomic Click Counter only (`click_count += 1`)** on redirect. Detailed event streaming (User-Agent, Referer, Timestamp logging) is moved to Phase 5.
8. **Privacy Model**: **Zero Client IP Collection / Storage in V1 MVP**. Eliminates GDPR/CCPA PII compliance risk completely.
9. **Payload Validation**: Restrict URL schemes strictly to `http://` and `https://` with a maximum length limit of **2,048 characters**.
10. **Rate Limiting**: Enforced per API Key (60 creation requests/minute).

---

## 2. Decoupled Engineering SLAs & Scale Benchmarks

* **Redirect Latency SLA (Read Path)**: P50 < 10ms | P95 < 25ms | **P99 < 50ms** (Backend processing execution budget).
* **Creation Latency SLA (Write Path)**: **P99 < 200ms**.
* **Redirect Engine Availability**: **99.99% ("Four Nines")** $\rightarrow < 52.56 \text{ mins/year downtime}$.
* **Link Creation API Availability**: **99.9% ("Three Nines")** $\rightarrow < 8.76 \text{ hours/year downtime}$.
* **Mapping Durability**: **Zero Data Loss ($RPO = 0$)** for acknowledged creation requests via transactional ACID persistence.
* **Capacity Benchmark**: 10M creates/month ($3.86 \text{ writes/sec avg}, 38.6 \text{ peak}$), 1B redirects/month ($385.8 \text{ reads/sec avg}, 3,858 \text{ peak}$), 100:1 Read-to-Write ratio.

---

## 3. Deferred Technical Implementation Decisions

1. **Database Selection & Schema Design**: Deferred to **Phase 2 (Architecture & Data Model)**.
2. **Short-Code Generation Algorithm**: Deferred to **Phase 2 & Phase 3**.
3. **Caching & Eviction Infrastructure (Redis)**: Deferred to **Phase 4**.
4. **Asynchronous Message Queue Pipeline (Kafka)**: Deferred to **Phase 5**.
5. **Malware Threat Scanning & SSRF Prevention**: Deferred to **Phase 6**.
6. **Horizontal Scaling & Distributed Systems**: Deferred to **Phase 7**.

---

# PHASE 1 IS OFFICIALLY LOCKED 🔒
