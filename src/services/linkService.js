const { generateShortCode } = require('../utils/base62');
const linksDb = require('../db/links');
const { linkCache } = require('../utils/cache');
const { incrementMetric } = require('../utils/metrics');

const MAX_INSERT_ATTEMPTS = 3;
const PG_UNIQUE_VIOLATION_CODE = '23505';

/**
 * Creates a short link (either with custom alias or CSPRNG Base62 random short code).
 * Performs PostgreSQL 23505 unique constraint collision handling.
 *
 * @param {string} targetUrl - Original un-normalized target URL
 * @param {string} userId - UUID of authenticated owner
 * @param {string|null} [alias=null] - Optional custom alias
 * @param {string|Date|null} [expiresAt=null] - Optional ISO-8601 expiration timestamp
 * @returns {Promise<Object>} Created link record
 */
async function createShortLink(targetUrl, userId, alias = null, expiresAt = null, routingConfig = null, dbClient = null) {
  // 1. Custom Alias Path (No random code generation or retry loop)
  if (alias) {
    try {
      const link = await linksDb.createLink(alias, targetUrl, userId, expiresAt, routingConfig, dbClient);
      return link;
    } catch (err) {
      if (err.code === PG_UNIQUE_VIOLATION_CODE) {
        const conflictErr = new Error('The requested alias is already in use');
        conflictErr.code = 'ALIAS_ALREADY_EXISTS';
        throw conflictErr;
      }
      throw err;
    }
  }

  // 2. Random Base62 Generation Path (with 3-attempt collision retry strategy)
  let attempts = 0;
  while (attempts < MAX_INSERT_ATTEMPTS) {
    attempts++;
    const shortCode = generateShortCode();

    try {
      const link = await linksDb.createLink(shortCode, targetUrl, userId, expiresAt, routingConfig, dbClient);
      return link;
    } catch (err) {
      if (err.code === PG_UNIQUE_VIOLATION_CODE) {
        if (attempts >= MAX_INSERT_ATTEMPTS) {
          const maxCollisionsErr = new Error('Maximum short-code insert attempts exceeded due to collisions');
          maxCollisionsErr.code = 'MAX_COLLISIONS_EXCEEDED';
          throw maxCollisionsErr;
        }
        continue;
      }
      throw err;
    }
  }

  const maxCollisionsErr = new Error('Maximum short-code insert attempts exceeded due to collisions');
  maxCollisionsErr.code = 'MAX_COLLISIONS_EXCEEDED';
  throw maxCollisionsErr;
}

/**
 * Retrieves a link record by short_code from cache or PostgreSQL database.
 * Falls back transparently to PostgreSQL on cache miss or cache failure.
 *
 * @param {string} shortCode - Short code or custom alias
 * @returns {Promise<Object|null>} Link record or null if not found
 */
async function getLinkByCode(shortCode) {
  const cached = linkCache.get(shortCode);
  if (cached !== null) {
    incrementMetric('redirect_cache_hits_total');
    return cached;
  }

  incrementMetric('redirect_cache_misses_total');
  const link = await linksDb.getLinkByShortCode(shortCode);
  if (link) {
    linkCache.set(shortCode, link);
  }
  return link;
}

/**
 * Updates target_url and/or expires_at for a link belonging to a specific user.
 * Immediately invalidates process-local redirect cache.
 *
 * @param {string} shortCode - Short code or custom alias
 * @param {string} userId - UUID of authenticated owner
 * @param {Object} fields - { targetUrl?: string, expiresAt?: string|null }
 * @returns {Promise<Object|null>} Updated link object or null if not found/unowned
 */
async function updateLink(shortCode, userId, fields) {
  const updated = await linksDb.updateUserLink(shortCode, userId, fields);
  // Ensure process-local cache is cleared
  linkCache.del(shortCode);
  return updated;
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
 * Invalidates the cached entry immediately to prevent stale redirects.
 *
 * @param {string} shortCode - Short code or custom alias
 * @param {string} userId - UUID of authenticated owner
 * @returns {Promise<Object>} Result object with status
 */
async function deactivateLink(shortCode, userId) {
  const result = await linksDb.deactivateUserLink(shortCode, userId);
  linkCache.del(shortCode);
  return result;
}

/**
 * Triggers a best-effort atomic click count increment.
 *
 * @param {string} shortCode - Short code or custom alias
 * @returns {Promise<boolean>} True if updated, false otherwise
 */
async function recordClickAsync(shortCode) {
  return await linksDb.incrementClickCount(shortCode);
}

module.exports = {
  createShortLink,
  getLinkByCode,
  updateLink,
  getUserLinks,
  deactivateLink,
  recordClickAsync,
  MAX_INSERT_ATTEMPTS,
  PG_UNIQUE_VIOLATION_CODE,
};
