const { query } = require('../config/db');

/**
 * Inserts a new API key record into PostgreSQL api_keys table.
 * Stores strictly the SHA-256 hash of the API key token.
 *
 * @param {string} userId - UUID of developer owner
 * @param {string} apiKeyHash - 64-character SHA-256 hex hash
 * @param {string} name - Friendly label/name for the key
 * @returns {Promise<Object>} Created key record (key_id, user_id, name, created_at, revoked_at)
 */
async function createApiKey(userId, apiKeyHash, name = 'Default Key') {
  const sql = `
    INSERT INTO api_keys (user_id, api_key_hash, name)
    VALUES ($1, $2, $3)
    RETURNING key_id, user_id, name, created_at, revoked_at
  `;
  const result = await query(sql, [userId, apiKeyHash, name]);
  return result.rows[0];
}

/**
 * Finds an API key record by SHA-256 hash.
 *
 * @param {string} apiKeyHash - 64-character SHA-256 hex hash
 * @returns {Promise<Object|null>} API key record or null if not found
 */
async function findApiKeyByHash(apiKeyHash) {
  const sql = `
    SELECT key_id, user_id, name, created_at, revoked_at
    FROM api_keys
    WHERE api_key_hash = $1
  `;
  const result = await query(sql, [apiKeyHash]);
  return result.rows[0] || null;
}

/**
 * Retrieves all API keys belonging to a developer.
 *
 * @param {string} userId - UUID of developer owner
 * @returns {Promise<Array<Object>>} Array of key records (without hashes)
 */
async function getUserApiKeys(userId) {
  const sql = `
    SELECT key_id, name, created_at, revoked_at
    FROM api_keys
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;
  const result = await query(sql, [userId]);
  return result.rows;
}

/**
 * Soft-revokes an API key owned by a developer (sets revoked_at = NOW()).
 * Idempotent update enforcing ownership strictly in SQL.
 *
 * @param {string} keyId - UUID of API key to revoke
 * @param {string} userId - UUID of developer owner
 * @returns {Promise<Object|null>} Revoked record if updated, null if missing, revoked, or unowned
 */
async function revokeUserApiKey(keyId, userId) {
  const sql = `
    UPDATE api_keys
    SET revoked_at = NOW()
    WHERE key_id = $1 AND user_id = $2 AND revoked_at IS NULL
    RETURNING key_id, name, created_at, revoked_at
  `;
  const result = await query(sql, [keyId, userId]);
  return result.rows[0] || null;
}

/**
 * Deletes an API key record by key_id.
 * Used strictly for test cleanup.
 *
 * @param {string} keyId - UUID of key to delete
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
async function deleteApiKeyById(keyId) {
  const sql = `DELETE FROM api_keys WHERE key_id = $1`;
  const result = await query(sql, [keyId]);
  return result.rowCount > 0;
}

module.exports = {
  createApiKey,
  findApiKeyByHash,
  getUserApiKeys,
  revokeUserApiKey,
  deleteApiKeyById,
};
