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
    short_code VARCHAR(10) PRIMARY KEY,
    target_url VARCHAR(2048) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    click_count BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast query resolution
CREATE INDEX idx_api_keys_hash ON api_keys (api_key_hash);
CREATE INDEX idx_api_keys_user ON api_keys (user_id);
CREATE INDEX idx_links_user_created ON links (user_id, created_at DESC);
