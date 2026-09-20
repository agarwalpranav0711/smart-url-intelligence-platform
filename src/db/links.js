
const { query, pool } = require('../config/db');
const { linkCache } = require('../utils/cache');

// Idempotent schema migration for Step 19, 21, 22 & Step 23
(async () => {
  try {
    await pool.query(
      'ALTER TABLE links ALTER COLUMN short_code TYPE VARCHAR(32); ' +
      'ALTER TABLE links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL; ' +
      'ALTER TABLE links ADD COLUMN IF NOT EXISTS routing_config JSONB DEFAULT NULL; ' +
      'CREATE TABLE IF NOT EXISTS link_analytics_hourly (' +
      '  short_code VARCHAR(32) NOT NULL REFERENCES links(short_code) ON DELETE CASCADE, ' +
      '  bucket_start TIMESTAMPTZ NOT NULL, ' +
      '  route_type VARCHAR(16) NOT NULL DEFAULT \'default\', ' +
      '  route_key VARCHAR(32) NOT NULL DEFAULT \'default\', ' +
      '  destination_url VARCHAR(2048) NOT NULL, ' +
      '  click_count BIGINT NOT NULL DEFAULT 1, ' +
      '  PRIMARY KEY (short_code, bucket_start, route_type, route_key) ' +
      '); ' +
      'CREATE INDEX IF NOT EXISTS idx_analytics_hourly_code_bucket ON link_analytics_hourly (short_code, bucket_start DESC); ' +
      'CREATE INDEX IF NOT EXISTS idx_analytics_hourly_bucket_code ON link_analytics_hourly (bucket_start DESC, short_code); ' +
      'CREATE TABLE IF NOT EXISTS idempotency_keys (' +
      '  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, ' +
      '  idempotency_key VARCHAR(64) NOT NULL, ' +
      '  request_hash CHAR(64) NOT NULL, ' +
      '  response_status INT NOT NULL, ' +
      '  response_body JSONB NOT NULL, ' +
      '  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, ' +
      '  expires_at TIMESTAMPTZ NOT NULL, ' +
      '  PRIMARY KEY (user_id, idempotency_key) ' +
      '); ' +
      'CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys (expires_at);'
    );
  } catch (_) {}
})();

/**
 * Inserts a new short link into PostgreSQL.
 * Uses parameterized queries to prevent SQL injection.
 * Database provides defaults for click_count (0), is_active (true), and created_at (NOW()).
 *
 * @param {string} shortCode - Base62 string or custom alias (max 32 chars)
 * @param {string} targetUrl - Original un-normalized target URL (max 2048 chars)
 * @param {string} userId - UUID of authenticated owner
 * @param {string|Date|null} [expiresAt=null] - Optional ISO-8601 expiration timestamp
 * @param {Object|null} [routingConfig=null] - Optional Step 21 routing configuration JSON object
 * @param {Object|null} [dbClient=null] - Optional transaction pg.Client for single-transaction idempotency
 * @returns {Promise<Object>} Inserted link record containing short_code, target_url, user_id, click_count, is_active, created_at, expires_at, routing_config
 */
async function createLink(shortCode, targetUrl, userId, expiresAt = null, routingConfig = null, dbClient = null) {
  const sql =
    'INSERT INTO links (short_code, target_url, user_id, expires_at, routing_config) ' +
    'VALUES ($1, $2, $3, $4, $5) ' +
    'RETURNING short_code, target_url, user_id, click_count, is_active, created_at, expires_at, routing_config';
  const queryExecutor = dbClient ? dbClient.query.bind(dbClient) : query;
  const result = await queryExecutor(sql, [shortCode, targetUrl, userId, expiresAt, routingConfig ? JSON.stringify(routingConfig) : null]);
  return result.rows[0];
}

/**
 * Retrieves a link record by short_code.
 *
 * @param {string} shortCode - Short code or custom alias
 * @returns {Promise<Object|null>} Link record or null if not found
 */
async function getLinkByShortCode(shortCode) {
  const sql =
    'SELECT short_code, target_url, user_id, click_count, is_active, created_at, expires_at, routing_config ' +
    'FROM links ' +
    'WHERE short_code = $1';
  const result = await query(sql, [shortCode]);
  return result.rows[0] || null;
}

/**
 * Retrieves a paginated list of links belonging to a specific user, ordered by created_at DESC.
 * Uses parameterized SQL queries to filter strictly by user_id.
 *
 * @param {string} userId - UUID of authenticated owner
 * @param {number} limit - Number of records to return (1 to 100)
 * @param {number} offset - Number of records to skip (>= 0)
 * @returns {Promise<Array<Object>>} Array of link objects
 */
async function getUserLinks(userId, limit, offset) {
  const sql =
    'SELECT short_code, target_url, click_count, is_active, created_at, expires_at, routing_config ' +
    'FROM links ' +
    'WHERE user_id = $1 ' +
    'ORDER BY created_at DESC ' +
    'LIMIT $2 ' +
    'OFFSET $3';
  const result = await query(sql, [userId, limit, offset]);
  return result.rows;
}

/**
 * Updates target_url, expires_at, and/or routing_config for a link belonging to a specific user.
 * Enforces ownership inside SQL: WHERE short_code = $1 AND user_id = $2.
 * Preserves short_code, created_at, click_count, and is_active status (editing an inactive link keeps it inactive).
 * Immediately invalidates process-local redirect cache.
 *
 * @param {string} shortCode - Short code or custom alias
 * @param {string} userId - UUID of authenticated owner
 * @param {Object} fields - { targetUrl?: string, expiresAt?: string|null, routingConfig?: Object|null }
 * @returns {Promise<Object|null>} Updated link object or null if not found/unowned
 */
async function updateUserLink(shortCode, userId, { targetUrl, expiresAt, routingConfig }) {
  const setClauses = [];
  const queryParams = [shortCode, userId];
  let paramIdx = 3;

  if (targetUrl !== undefined) {
    setClauses.push('target_url = $' + paramIdx++);
    queryParams.push(targetUrl);
  }

  if (expiresAt !== undefined) {
    setClauses.push('expires_at = $' + paramIdx++);
    queryParams.push(expiresAt);
  }

  if (routingConfig !== undefined) {
    setClauses.push('routing_config = $' + paramIdx++);
    queryParams.push(routingConfig ? JSON.stringify(routingConfig) : null);
  }

  if (setClauses.length === 0) {
    return await getLinkByShortCode(shortCode);
  }

  const sql =
    'UPDATE links SET ' + setClauses.join(', ') +
    ' WHERE short_code = $1 AND user_id = $2 ' +
    'RETURNING short_code, target_url, user_id, click_count, is_active, created_at, expires_at, routing_config';

  const result = await query(sql, queryParams);
  // Immediately invalidate process-local redirect cache
  linkCache.del(shortCode);

  return result.rows[0] || null;
}

/**
 * Soft-deactivates a link belonging to a specific user (is_active = false).
 * Enforces ownership inside SQL query: WHERE short_code = $1 AND user_id = $2.
 * Does NOT physically delete the database row.
 * Idempotent: Repeated calls on an already-inactive link owned by the user succeed.
 *
 * @param {string} shortCode - Short code or custom alias
 * @param {string} userId - UUID of authenticated owner
 * @returns {Promise<Object>} Object containing status: 'DEACTIVATED' | 'ALREADY_INACTIVE' | 'NOT_FOUND'
 */
async function deactivateUserLink(shortCode, userId) {
  // 1. Attempt ownership-aware update for active link
  const updateSql =
    'UPDATE links ' +
    'SET is_active = false ' +
    'WHERE short_code = $1 AND user_id = $2 AND is_active = true ' +
    'RETURNING short_code, target_url, user_id, click_count, is_active, created_at, expires_at, routing_config';
  const updateResult = await query(updateSql, [shortCode, userId]);
  if (updateResult.rows.length > 0) {
    linkCache.del(shortCode);
    return { status: 'DEACTIVATED', link: updateResult.rows[0] };
  }

  // 2. If no active row was updated, check if link exists for this user (already is_active = false)
  const checkSql =
    'SELECT short_code, is_active ' +
    'FROM links ' +
    'WHERE short_code = $1 AND user_id = $2';
  const checkResult = await query(checkSql, [shortCode, userId]);
  if (checkResult.rows.length > 0) {
    linkCache.del(shortCode);
    return { status: 'ALREADY_INACTIVE' };
  }

  // 3. Link does not exist or belongs to another user
  return { status: 'NOT_FOUND' };
}

/**
 * Atomically increments the click_count of an active, non-expired link by 1 in PostgreSQL.
 * Uses atomic SQL-side increment: click_count = click_count + 1.
 *
 * @param {string} shortCode - Short code or custom alias
 * @returns {Promise<boolean>} True if updated, false otherwise
 */
async function incrementClickCount(shortCode) {
  const sql =
    'UPDATE links ' +
    'SET click_count = click_count + 1 ' +
    'WHERE short_code = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())';
  const result = await query(sql, [shortCode]);
  return result.rowCount > 0;
}

/**
 * Sets the is_active status of a link by short_code.
 * Used for testing inactive links. Invalidates cache entry.
 *
 * @param {string} shortCode - Short code or custom alias
 * @param {boolean} isActive - New active status
 * @returns {Promise<boolean>} True if updated, false otherwise
 */
async function setLinkActiveStatus(shortCode, isActive) {
  const sql =
    'UPDATE links ' +
    'SET is_active = $2 ' +
    'WHERE short_code = $1';
  const result = await query(sql, [shortCode, isActive]);
  linkCache.del(shortCode);
  return result.rowCount > 0;
}

/**
 * Deletes a link record by short_code.
 * Used ONLY for test cleanup. Invalidates cache entry.
 *
 * @param {string} shortCode - Short code or custom alias
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
async function deleteLinkByShortCode(shortCode) {
  const sql = 'DELETE FROM links WHERE short_code = $1';
  const result = await query(sql, [shortCode]);
  linkCache.del(shortCode);
  return result.rowCount > 0;
}

module.exports = {
  createLink,
  getLinkByShortCode,
  getUserLinks,
  updateUserLink,
  deactivateUserLink,
  incrementClickCount,
  setLinkActiveStatus,
  deleteLinkByShortCode,
};
