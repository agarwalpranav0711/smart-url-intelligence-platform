# Step 11 — API-Key & Developer Identity Management Architecture

## 1. Problem Statement
During initial MVP steps (Steps 3–10), authentication required a pre-existing API key hash inside the PostgreSQL `users` table. However, there was no programmatic, self-service developer registration or key lifecycle management endpoint. Developers had to manually provision database rows.

## 2. Existing MVP Limitation
- **Single Key Coupling**: `users.api_key_hash` coupled 1 user to exactly 1 API key.
- **No Zero-Downtime Rotation**: Rotating a key required overwriting the active key hash, causing immediate service interruption for any client using the old key before updating to the new key.
- **No Key Revocation Control**: No way to track key labels, active state, or explicit revocation timestamp (`revoked_at`).

---

## 3. Design Alternatives Considered

### Option A: Single Key per User in `users` Table
- **Pros**: Minimal schema changes.
- **Cons**: Impossible to support zero-downtime key rotation, multiple keys, key naming/labels, or independent key revocation.

### Option B: Dedicated `api_keys` Table Linked to `users` (CHOSEN DESIGN)
- **Pros**:
  1. Decouples developer identity (`users`) from API credentials (`api_keys`).
  2. Enables multiple active keys per developer for seamless key rotation.
  3. Supports key naming (`name`) and soft-revocation (`revoked_at`).
  4. Keeps `links.user_id` foreign key and `req.user = { userId: user.user_id }` contract 100% unchanged!
- **Cons**: Requires 1 additional relational table (`api_keys`).

---

## 4. Chosen Architecture & Database Schema

```sql
-- Developer Identity Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys Table
CREATE TABLE api_keys (
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL DEFAULT 'Default Key',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes for resolution speed
CREATE INDEX idx_api_keys_hash ON api_keys (api_key_hash);
CREATE INDEX idx_api_keys_user ON api_keys (user_id);
```

---

## 5. API-Key Lifecycle

```
[Developer Registration / Key Creation]
                   │
                   ▼
  Generate Cryptographic Secret (sk_live_<32-bytes-hex>)
                   │
                   ▼
     Compute SHA-256 Hash of Secret
                   │
                   ▼
  Store Hash in PostgreSQL (api_keys)
                   │
                   ▼
  Return Raw API Key ONCE to Client Payload
                   │
                   ▼
[Authentication: Bearer <sk_live_...>]
                   │
                   ▼
  Compute SHA-256 -> Match api_key_hash WHERE revoked_at IS NULL
                   │
                   ▼
[Revocation: DELETE /api/v1/api-keys/:id]
                   │
                   ▼
  Set revoked_at = NOW() -> Key immediately rejected (HTTP 401)
```

---

## 6. Bootstrap Strategy & API Endpoints

### 1. Developer Bootstrap (`POST /api/v1/users`)
- **Public Endpoint**: Allows new developers to register an account and receive an initial API key.
- **Response (`HTTP 201 Created`)**:
```json
{
  "user_id": "b19f5e8f-19f3-4383-8289-315ac613c989",
  "key_id": "c28d9e1f-28e4-4982-9381-425ac714d990",
  "name": "Initial Key",
  "api_key": "sk_live_7f8a3b2c...",
  "created_at": "2026-09-16T12:00:00.000Z"
}
```

### 2. Create Secondary API Key (`POST /api/v1/api-keys`)
- **Authenticated Endpoint** (`Bearer <API_KEY>`).
- Provisions additional API keys for key rotation or multi-environment access (e.g. CI/CD vs Production).

### 3. List API Keys (`GET /api/v1/api-keys`)
- **Authenticated Endpoint** (`Bearer <API_KEY>`).
- Returns metadata for all keys owned by developer (`key_id`, `name`, `created_at`, `revoked_at`). Excludes raw keys and hashes.

### 4. Revoke API Key (`DELETE /api/v1/api-keys/:id`)
- **Authenticated Endpoint** (`Bearer <API_KEY>`).
- Soft-revokes key (`revoked_at = NOW()`). Ownership is enforced strictly in SQL (`WHERE key_id = $1 AND user_id = $2`).

---

## 7. Security & Rate Limiting Controls

* **Zero Plaintext Storage**: PostgreSQL stores strictly the 64-character SHA-256 hex digest (`api_key_hash`).
* **One-Time Exposure**: Raw API keys are returned **ONLY ONCE** in the HTTP 201 creation payload and never stored or logged.
* **Sensitive Data Exclusion**: Raw API keys, hashes, and Bearer tokens are scrubbed from all Pino logs and error responses.
* **Rate Limiting**: Rate limits remain 60 requests per 60 seconds per user identity (`req.user.userId`).

---

## 8. Observability Integration

* **Pino Events**:
  - `api_key.created`
  - `api_key.revoked`
* **Metrics Counters (`GET /metrics`)**:
  - `api_keys_created_total`
  - `api_keys_revoked_total`
  - `api_key_auth_failures_total`

---

## 9. Verification & Test Suite

Dedicated test file [`test/step11-api-key-management.test.js`](file:///d:/WebDev%20PROJECTS/tiny%20url/test/step11-api-key-management.test.js) verifies 22 test assertions covering:
- CSPRNG key generation (`sk_live_` prefix + 64 hex chars).
- One-time raw key return and hash-only DB storage.
- Authentication with active primary and secondary keys.
- Revocation and immediate post-revocation HTTP 401 failure.
- Idempotency and cross-user ownership privacy.
- Regression testing across all link management and redirect endpoints.
