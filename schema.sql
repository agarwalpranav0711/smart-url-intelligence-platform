-- DDL Schema Migration for Smart URL Intelligence Platform (Step 11 Developer Identity & API-Key Management)

-- Drop existing tables if re-initializing
DROP TABLE IF EXISTS links CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table (Developer Accounts)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. API Keys Table (Cryptographic Credential Hashes & Lifecycle)
CREATE TABLE api_keys (
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL DEFAULT 'Default Key',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ DEFAULT NULL
);

-- 3. Links Table (Core Short Link Mapping Record)
CREATE TABLE links (
    short_code VARCHAR(32) PRIMARY KEY,
    target_url VARCHAR(2048) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    click_count BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NULL,
    routing_config JSONB DEFAULT NULL
);

-- Indexes for fast query resolution
CREATE INDEX idx_api_keys_user ON api_keys (user_id);
CREATE INDEX idx_links_user_created ON links (user_id, created_at DESC);

-- 4. Step 22 Hourly Traffic & Routing Analytics Table
CREATE TABLE IF NOT EXISTS link_analytics_hourly (
    short_code VARCHAR(32) NOT NULL REFERENCES links(short_code) ON DELETE CASCADE,
    bucket_start TIMESTAMPTZ NOT NULL,
    route_type VARCHAR(16) NOT NULL DEFAULT 'default',
    route_key VARCHAR(32) NOT NULL DEFAULT 'default',
    destination_url VARCHAR(2048) NOT NULL,
    click_count BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (short_code, bucket_start, route_type, route_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_hourly_code_bucket ON link_analytics_hourly (short_code, bucket_start DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_hourly_bucket_code ON link_analytics_hourly (bucket_start DESC, short_code);

-- 5. Step 23 Transactional Idempotency Keys Table
CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    idempotency_key VARCHAR(64) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_status INT NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys (expires_at);

-- 6. Step 24F Web Session Authentication Table
CREATE TABLE IF NOT EXISTS sessions (
    session_id_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    csrf_token_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at) WHERE revoked_at IS NULL;

