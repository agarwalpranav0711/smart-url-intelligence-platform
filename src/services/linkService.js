const { generateShortCode } = require('../utils/base62');
const linksDb = require('../db/links');

const MAX_INSERT_ATTEMPTS = 3;
const PG_UNIQUE_VIOLATION_CODE = '23505';

/**
 * Creates a short link with CSPRNG short code generation and PostgreSQL unique constraint collision retry.
 * Performs maximum 3 total insert attempts on PostgreSQL 23505 collision errors.
 *
 * @param {string} targetUrl - Original un-normalized target URL
 * @param {string} userId - UUID of authenticated owner
 * @returns {Promise<Object>} Created link record
 */
async function createShortLink(targetUrl, userId) {
  let attempts = 0;

  while (attempts < MAX_INSERT_ATTEMPTS) {
    attempts++;
    const shortCode = generateShortCode();

    try {
      const link = await linksDb.createLink(shortCode, targetUrl, userId);
      return link;
    } catch (err) {
      // Only treat PostgreSQL 23505 (unique_violation) as a collision
      if (err.code === PG_UNIQUE_VIOLATION_CODE) {
        if (attempts >= MAX_INSERT_ATTEMPTS) {
          const maxCollisionsErr = new Error('Maximum short-code insert attempts exceeded due to collisions');
          maxCollisionsErr.code = 'MAX_COLLISIONS_EXCEEDED';
          throw maxCollisionsErr;
        }
        // Retry loop on 23505 collision
        continue;
      }

      // Non-23505 errors (connection failure, syntax error, etc.) must NOT be retried as collisions
      throw err;
    }
  }

  const maxCollisionsErr = new Error('Maximum short-code insert attempts exceeded due to collisions');
  maxCollisionsErr.code = 'MAX_COLLISIONS_EXCEEDED';
  throw maxCollisionsErr;
}

/**
 * Retrieves a link record by short_code from PostgreSQL database.
 *
 * @param {string} shortCode - 6-character short code
 * @returns {Promise<Object|null>} Link record or null if not found
 */
async function getLinkByCode(shortCode) {
  return await linksDb.getLinkByShortCode(shortCode);
}

/**
 * Retrieves a paginated list of links belonging to a specific user.
 *
 * @param {string} userId - UUID of authenticated owner
 * @param {number} limit - Number of records to return
 * @param {number} offset - Number of records to skip
 * @returns {Promise<Array<Object>>} Array of link objects
 */
async function getUserLinks(userId, limit, offset) {
  return await linksDb.getUserLinks(userId, limit, offset);
}

/**
 * Soft-deactivates a link belonging to the authenticated user.
 *
 * @param {string} shortCode - 6-character short code
 * @param {string} userId - UUID of authenticated owner
 * @returns {Promise<Object>} Result object with status
 */
async function deactivateLink(shortCode, userId) {
  return await linksDb.deactivateUserLink(shortCode, userId);
}

/**
 * Triggers a best-effort atomic click count increment.
 *
 * @param {string} shortCode - 6-character short code
 * @returns {Promise<boolean>} True if updated, false otherwise
 */
async function recordClickAsync(shortCode) {
  return await linksDb.incrementClickCount(shortCode);
}

module.exports = {
  createShortLink,
  getLinkByCode,
  getUserLinks,
  deactivateLink,
  recordClickAsync,
  MAX_INSERT_ATTEMPTS,
  PG_UNIQUE_VIOLATION_CODE,
};
