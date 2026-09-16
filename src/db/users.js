const { query } = require('../config/db');

/**
 * Finds a user account by SHA-256 API key hash.
 * Uses parameterized queries to prevent SQL injection.
 * Returns only the required user fields (user_id, created_at).
 *
 * @param {string} apiKeyHash - 64-character SHA-256 hex string
 * @returns {Promise<Object|null>} User record object or null if not found
 */
async function findUserByApiKeyHash(apiKeyHash) {
  const sql = `
    SELECT user_id, created_at 
    FROM users 
    WHERE api_key_hash = $1
  `;
  const result = await query(sql, [apiKeyHash]);
  return result.rows[0] || null;
}

/**
 * Creates a new user record with a SHA-256 API key hash.
 * Used for user registration and test user creation.
 *
 * @param {string} apiKeyHash - 64-character SHA-256 hex string
 * @returns {Promise<Object>} Created user record containing user_id and created_at
 */
async function createUser(apiKeyHash) {
  const sql = `
    INSERT INTO users (api_key_hash) 
    VALUES ($1) 
    RETURNING user_id, created_at
  `;
  const result = await query(sql, [apiKeyHash]);
  return result.rows[0];
}

/**
 * Deletes a user by user_id.
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
  findUserByApiKeyHash,
  createUser,
  deleteUserById,
};
