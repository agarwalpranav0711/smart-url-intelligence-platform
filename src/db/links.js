const { query } = require('../config/db');
const { linkCache } = require('../utils/cache');


/**
 * Inserts a new short link into PostgreSQL.
 * Uses parameterized queries to prevent SQL injection.
 * Database provides defaults for click_count (0), is_active (true), and created_at (NOW()).
 *
 * @param {string} shortCode - 6-character Base62 string
 * @param {string} targetUrl - Original un-normalized target URL (max 2048 chars)
 * @param {string} userId - UUID of authenticated owner
 * @returns {Promise<Object>} Inserted link record containing short_code, target_url, user_id, click_count, is_active, created_at
 */
async function createLink(shortCode, targetUrl, userId) {
  const sql = `
    INSERT INTO links (short_code, target_url, user_id)
    VALUES ($1, $2, $3)
    RETURNING short_code, target_url, user_id, click_count, is_active, created_at
  `;
  const result = await query(sql, [shortCode, targetUrl, userId]);
  return result.rows[0];
}

/**
 * Retrieves a link record by short_code.
 *
 * @param {string} shortCode - 6-character short code
 * @returns {Promise<Object|null>} Link record or null if not found
 */
async function getLinkByShortCode(shortCode) {
  const sql = `
    SELECT short_code, target_url, user_id, click_count, is_active, created_at
    FROM links
    WHERE short_code = $1
  `;
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
  const sql = `
    SELECT short_code, target_url, click_count, is_active, created_at
    FROM links
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    OFFSET $3
  `;
  const result = await query(sql, [userId, limit, offset]);
  return result.rows;
}

/**
 * Soft-deactivates a link belonging to a specific user (is_active = false).
 * Enforces ownership inside SQL query: WHERE short_code = $1 AND user_id = $2.
 * Does NOT physically delete the database row.
 * Idempotent: Repeated calls on an already-inactive link owned by the user succeed.
 *
 * @param {string} shortCode - 6-character short code
 * @param {string} userId - UUID of authenticated owner
 * @returns {Promise<Object>} Object containing status: 'DEACTIVATED' | 'ALREADY_INACTIVE' | 'NOT_FOUND'
 */
async function deactivateUserLink(shortCode, userId) {
  // 1. Attempt ownership-aware update for active link
  const updateSql = `
    UPDATE links
    SET is_active = false
    WHERE short_code = $1 AND user_id = $2 AND is_active = true
    RETURNING short_code, target_url, user_id, click_count, is_active, created_at
  `;
  const updateResult = await query(updateSql, [shortCode, userId]);
  if (updateResult.rows.length > 0) {
    return { status: 'DEACTIVATED', link: updateResult.rows[0] };
  }

  // 2. If no active row was updated, check if link exists for this user (already is_active = false)
  const checkSql = `
    SELECT short_code, is_active
    FROM links
    WHERE short_code = $1 AND user_id = $2
  `;
  const checkResult = await query(checkSql, [shortCode, userId]);
  if (checkResult.rows.length > 0) {
    return { status: 'ALREADY_INACTIVE' };
  }

  // 3. Link does not exist or belongs to another user
  return { status: 'NOT_FOUND' };
}

/**
 * Atomically increments the click_count of an active link by 1 in PostgreSQL.
 * Uses atomic SQL-side increment: click_count = click_count + 1.
 *
 * @param {string} shortCode - 6-character short code
 * @returns {Promise<boolean>} True if updated, false if link was inactive or not found
 */
async function incrementClickCount(shortCode) {
  const sql = `
    UPDATE links
    SET click_count = click_count + 1
    WHERE short_code = $1 AND is_active = true
  `;
  const result = await query(sql, [shortCode]);
  return result.rowCount > 0;
}

/**

 * Sets the is_active status of a link by short_code.
 * Used for testing inactive links. Invalidates cache entry.
 *
 * @param {string} shortCode - 6-character short code
 * @param {boolean} isActive - New active status
 * @returns {Promise<boolean>} True if updated, false otherwise
 */
async function setLinkActiveStatus(shortCode, isActive) {
  const sql = `
    UPDATE links
    SET is_active = $2
    WHERE short_code = $1
  `;
  const result = await query(sql, [shortCode, isActive]);
  linkCache.del(shortCode);
  return result.rowCount > 0;
}

/**
 * Deletes a link record by short_code.
 * Used ONLY for test cleanup. Invalidates cache entry.
 *
 * @param {string} shortCode - 6-character short code
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
async function deleteLinkByShortCode(shortCode) {
  const sql = `DELETE FROM links WHERE short_code = $1`;
  const result = await query(sql, [shortCode]);
  linkCache.del(shortCode);
  return result.rowCount > 0;
}


module.exports = {
  createLink,
  getLinkByShortCode,
  getUserLinks,
  deactivateUserLink,
  incrementClickCount,
  setLinkActiveStatus,
  deleteLinkByShortCode,
};
