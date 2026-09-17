const { query } = require('../config/db');
const apiKeysDb = require('./apiKeys');

/**
 * Creates a new developer account record in PostgreSQL users table.
 *
 * @returns {Promise<Object>} Created user record containing user_id and created_at
 */
async function createUser(apiKeyHash = null) {
  // If an apiKeyHash is provided (legacy test compatibility), create user and provision initial key
  const userSql = `
    INSERT INTO users DEFAULT VALUES
    RETURNING user_id, created_at
  `;
  const result = await query(userSql);
  const user = result.rows[0];

  if (apiKeyHash) {
    await apiKeysDb.createApiKey(user.user_id, apiKeyHash, 'Initial Key');
  }

  return user;
}

/**
 * Finds a user record by user_id.
 *
 * @param {string} userId - UUID of developer
 * @returns {Promise<Object|null>} User record object or null if not found
 */
async function findUserById(userId) {
  const sql = `
    SELECT user_id, created_at
    FROM users
    WHERE user_id = $1
  `;
  const result = await query(sql, [userId]);
  return result.rows[0] || null;
}

/**
 * Finds a user account by API key hash for backward compatibility.
 * Delegates to apiKeysDb and returns user identity object.
 *
 * @param {string} apiKeyHash - 64-character SHA-256 hex string
 * @returns {Promise<Object|null>} User object { user_id, created_at } or null
 */
async function findUserByApiKeyHash(apiKeyHash) {
  const keyRecord = await apiKeysDb.findApiKeyByHash(apiKeyHash);
  if (!keyRecord || keyRecord.revoked_at !== null) {
    return null;
  }
  return { user_id: keyRecord.user_id };
}

/**
 * Deletes a user by user_id.
 * Cascade deletion removes all associated API keys and links.
 * Used for cleanup during testing.
 *
 * @param {string} userId - UUID of user to delete
 * @returns {Promise<boolean>} True if deleted, false otherwise
 */
async function deleteUserById(userId) {
  const sql = `DELETE FROM users WHERE user_id = $1`;
  const result = await query(sql, [userId]);
  return result.rowCount > 0;
}

module.exports = {
  createUser,
  findUserById,
  findUserByApiKeyHash,
  deleteUserById,
};
