-- DDL Schema Migration for Smart URL Intelligence Platform (Phase 2 Data Model)

-- Drop existing tables if re-initializing
DROP TABLE IF EXISTS links CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table (Developer Accounts & API Key Hashes)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Links Table (Core Short Link Mapping Record)
CREATE TABLE links (
    short_code VARCHAR(10) PRIMARY KEY,
    target_url VARCHAR(2048) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    click_count BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite B-Tree index for fast paginated listing of developer's links
CREATE INDEX idx_links_user_created ON links (user_id, created_at DESC);
