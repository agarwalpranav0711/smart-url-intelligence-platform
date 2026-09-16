const crypto = require('crypto');
const usersDb = require('../db/users');

/**
 * Express Middleware: Authenticates API requests using Bearer API Key.
 *
 * Steps:
 * 1. Reads Authorization header.
 * 2. Validates Bearer authentication scheme.
 * 3. Hashes supplied API key using SHA-256.
 * 4. Queries PostgreSQL users table by api_key_hash.
 * 5. On success: Attaches minimal user identity { userId: user.user_id } to req.user and calls next().
 * 6. On failure: Returns HTTP 401 with structured JSON error.
 */
async function authenticateApiKey(req, res, next) {
  const authHeader = req.get('Authorization') || req.get('authorization');

  // 1. Verify Authorization header exists and uses Bearer scheme
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }

  // 2. Extract raw API key token (after "Bearer ")
  const rawApiKey = authHeader.substring(7).trim();

  if (!rawApiKey) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }

  try {
    // 3. Compute SHA-256 hash of raw API key token
    const apiKeyHash = crypto
      .createHash('sha256')
      .update(rawApiKey)
      .digest('hex');

    // 4. Query PostgreSQL database for matching user
    const user = await usersDb.findUserByApiKeyHash(apiKeyHash);

    if (!user) {
      // Security: Do not reveal whether API key format was correct or key existed
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    // 5. Attach minimal user identity to request object
    req.user = {
      userId: user.user_id
    };

    return next();
  } catch (err) {
    // Log internal error safely without exposing raw credentials or headers
    console.error('Authentication internal error:', err.message);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

module.exports = authenticateApiKey;
