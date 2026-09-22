const { query } = require('../config/db');

/**
 * Creates a new web session in PostgreSQL sessions table.
 *
 * @param {Object} params
 * @param {string} params.sessionIdHash - SHA-256 hash of raw session ID
 * @param {string} params.userId - UUID of user
 * @param {string} params.csrfTokenHash - SHA-256 hash of raw CSRF token
 * @param {Date} params.expiresAt - Expiration timestamp
 * @returns {Promise<Object>} Created session record
 */
async function createSession({ sessionIdHash, userId, csrfTokenHash, expiresAt }) {
  const sql = `
    INSERT INTO sessions (session_id_hash, user_id, csrf_token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    RETURNING session_id_hash, user_id, csrf_token_hash, created_at, expires_at, revoked_at, last_seen_at
  `;
  const result = await query(sql, [sessionIdHash, userId, csrfTokenHash, expiresAt]);
  return result.rows[0];
}

/**
 * Finds an active, non-expired, non-revoked session by session ID hash.
 *
 * @param {string} sessionIdHash - SHA-256 hash of raw session ID
 * @returns {Promise<Object|null>} Session record or null
 */
async function findSessionByHash(sessionIdHash) {
  const sql = `
    SELECT session_id_hash, user_id, csrf_token_hash, created_at, expires_at, revoked_at, last_seen_at
    FROM sessions
    WHERE session_id_hash = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  const result = await query(sql, [sessionIdHash]);
  return result.rows[0] || null;
}

/**
 * Updates last_seen_at and rotates the CSRF token hash for an active session.
 *
 * @param {string} sessionIdHash - SHA-256 hash of raw session ID
 * @param {string} newCsrfTokenHash - SHA-256 hash of new raw CSRF token
 * @returns {Promise<Object|null>} Updated session record
 */
async function updateLastSeenAndCsrf(sessionIdHash, newCsrfTokenHash) {
  const sql = `
    UPDATE sessions
    SET last_seen_at = NOW(),
        csrf_token_hash = $2
    WHERE session_id_hash = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
    RETURNING session_id_hash, user_id, csrf_token_hash, created_at, expires_at, revoked_at, last_seen_at
  `;
  const result = await query(sql, [sessionIdHash, newCsrfTokenHash]);
  return result.rows[0] || null;
}

/**
 * Marks a session as revoked.
 *
 * @param {string} sessionIdHash - SHA-256 hash of raw session ID
 * @returns {Promise<boolean>} True if revoked, false if not found or already revoked
 */
async function revokeSession(sessionIdHash) {
  const sql = `
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE session_id_hash = $1
      AND revoked_at IS NULL
  `;
  const result = await query(sql, [sessionIdHash]);
  return result.rowCount > 0;
}

/**
 * Revokes all active sessions for a given user ID.
 *
 * @param {string} userId - UUID of user
 * @returns {Promise<number>} Count of revoked sessions
 */
async function revokeAllUserSessions(userId) {
  const sql = `
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE user_id = $1
      AND revoked_at IS NULL
  `;
  const result = await query(sql, [userId]);
  return result.rowCount;
}

/**
 * Purges expired or revoked sessions older than 7 days in bounded batches.
 *
 * @param {number} batchSize - Maximum rows to delete per execution
 * @returns {Promise<number>} Number of rows deleted
 */
async function purgeExpiredSessions(batchSize = 5000) {
  const sql = `
    DELETE FROM sessions
    WHERE session_id_hash IN (
      SELECT session_id_hash FROM sessions
      WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')
      LIMIT $1
    )
  `;
  const result = await query(sql, [batchSize]);
  return result.rowCount || 0;
}

module.exports = {
  createSession,
  findSessionByHash,
  updateLastSeenAndCsrf,
  revokeSession,
  revokeAllUserSessions,
  purgeExpiredSessions,
};
