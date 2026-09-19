
const { query, pool } = require('../config/db');
const { linkCache } = require('../utils/cache');

// Idempotent schema migration for Step 19 (VARCHAR(32) short_code & expires_at column)
(async () => {
  try {
    await pool.query(
      'ALTER TABLE links ALTER COLUMN short_code TYPE VARCHAR(32); ' +
      'ALTER TABLE links ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;'
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
 * @returns {Promise<Object>} Inserted link record containing short_code, target_url, user_id, click_count, is_active, created_at, expires_at
 */
async function createLink(shortCode, targetUrl, userId, expiresAt = null) {
  const sql =
    'INSERT INTO links (short_code, target_url, user_id, expires_at) ' +
    'VALUES ($1, $2, $3, $4) ' +
    'RETURNING short_code, target_url, user_id, click_count, is_active, created_at, expires_at';
  const result = await query(sql, [shortCode, targetUrl, userId, expiresAt]);
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
    'SELECT short_code, target_url, user_id, click_count, is_active, created_at, expires_at ' +
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
    'SELECT short_code, target_url, click_count, is_active, created_at, expires_at ' +
    'FROM links ' +
    'WHERE user_id = $1 ' +
    'ORDER BY created_at DESC ' +
    'LIMIT $2 ' +
    'OFFSET $3';
  const result = await query(sql, [userId, limit, offset]);
  return result.rows;
}

/**
 * Updates target_url and/or expires_at for a link belonging to a specific user.
 * Enforces ownership inside SQL: WHERE short_code = $1 AND user_id = $2.
 * Preserves short_code, created_at, click_count, and is_active status (editing an inactive link keeps it inactive).
 * Immediately invalidates process-local redirect cache.
 *
 * @param {string} shortCode - Short code or custom alias
 * @param {string} userId - UUID of authenticated owner
 * @param {Object} fields - { targetUrl?: string, expiresAt?: string|null }
 * @returns {Promise<Object|null>} Updated link object or null if not found/unowned
 */
async function updateUserLink(shortCode, userId, { targetUrl, expiresAt }) {
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

  if (setClauses.length === 0) {
    return await getLinkByShortCode(shortCode);
  }

  const sql =
    'UPDATE links SET ' + setClauses.join(', ') +
    ' WHERE short_code = $1 AND user_id = $2 ' +
    'RETURNING short_code, target_url, user_id, click_count, is_active, created_at, expires_at';

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
    'RETURNING short_code, target_url, user_id, click_count, is_active, created_at, expires_at';
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
