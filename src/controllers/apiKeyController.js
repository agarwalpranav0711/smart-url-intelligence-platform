const crypto = require('crypto');
const usersDb = require('../db/users');
const apiKeysDb = require('../db/apiKeys');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

/**
 * Helper function to generate a cryptographically secure raw API key.
 * Format: sk_live_<64-char-hex-secret>
 */
function generateRawApiKey() {
  return 'sk_live_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Helper function to compute SHA-256 hash of a raw API key token.
 */
function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Public Developer Registration Endpoint (POST /api/v1/users).
 * Bootstrap mechanism allowing a developer to register an account and receive an initial API key.
 */
async function registerDeveloper(req, res) {
  try {
    const keyName = (req.body && typeof req.body.name === 'string' && req.body.name.trim())
      ? req.body.name.trim()
      : 'Initial Key';

    // 1. Create user account
    const user = await usersDb.createUser();

    // 2. Generate raw API key secret and compute SHA-256 hash
    const rawApiKey = generateRawApiKey();
    const apiKeyHash = hashApiKey(rawApiKey);

    // 3. Store API key hash in database
    const keyRecord = await apiKeysDb.createApiKey(user.user_id, apiKeyHash, keyName);

    incrementMetric('api_keys_created_total');
    logger.info({ event: 'api_key.created' });

    // 4. Return raw API key EXACTLY ONCE to client
    return res.status(201).json({
      user_id: user.user_id,
      key_id: keyRecord.key_id,
      name: keyRecord.name,
      api_key: rawApiKey,
      created_at: keyRecord.created_at
    });
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'register_developer', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

/**
 * Create Additional API Key Endpoint (POST /api/v1/api-keys).
 * Authenticated endpoint for zero-downtime key rotation.
 */
async function createKey(req, res) {
  try {
    const userId = req.user.userId;
    const keyName = (req.body && typeof req.body.name === 'string' && req.body.name.trim())
      ? req.body.name.trim()
      : 'Secondary Key';

    const rawApiKey = generateRawApiKey();
    const apiKeyHash = hashApiKey(rawApiKey);

    const keyRecord = await apiKeysDb.createApiKey(userId, apiKeyHash, keyName);

    incrementMetric('api_keys_created_total');
    logger.info({ event: 'api_key.created' });

    return res.status(201).json({
      key_id: keyRecord.key_id,
      name: keyRecord.name,
      api_key: rawApiKey,
      created_at: keyRecord.created_at
    });
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'create_api_key', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

/**
 * List API Keys Endpoint (GET /api/v1/api-keys).
 * Authenticated endpoint listing developer's API keys (without raw keys or hashes).
 */
async function listKeys(req, res) {
  try {
    const userId = req.user.userId;
    const keys = await apiKeysDb.getUserApiKeys(userId);

    const formattedKeys = keys.map((k) => ({
      key_id: k.key_id,
      name: k.name,
      created_at: k.created_at,
      revoked_at: k.revoked_at
    }));

    return res.status(200).json({
      api_keys: formattedKeys
    });
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'list_api_keys', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

/**
 * Revoke API Key Endpoint (DELETE /api/v1/api-keys/:id).
 * Authenticated endpoint soft-revoking a developer's API key.
 */
async function revokeKey(req, res) {
  try {
    const userId = req.user.userId;
    const keyId = req.params.id;

    const revokedRecord = await apiKeysDb.revokeUserApiKey(keyId, userId);

    if (!revokedRecord) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'API key not found'
        }
      });
    }

    incrementMetric('api_keys_revoked_total');
    logger.info({ event: 'api_key.revoked' });

    return res.status(200).json({
      message: 'API key revoked successfully'
    });
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'revoke_api_key', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

module.exports = {
  registerDeveloper,
  createKey,
  listKeys,
  revokeKey,
  generateRawApiKey,
  hashApiKey,
};
