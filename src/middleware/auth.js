const crypto = require('crypto');
const usersDb = require('../db/users');
const sessionsDb = require('../db/sessions');
const { incrementMetric } = require('../utils/metrics');

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:3000'
]);

if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach(o => allowedOrigins.add(o.trim()));
}
if (process.env.APP_URL) {
  allowedOrigins.add(process.env.APP_URL.trim());
}

/**
 * Express Middleware: Authenticates API requests using either:
 * 1. HttpOnly Session Cookie + X-CSRF-Token (for web UI consumers)
 * 2. Bearer API Key in Authorization header (for CLI/SDK consumers)
 */
async function authenticateApiKey(req, res, next) {
  const sidCookie = req.cookies?.sid;
  const authHeader = req.get('Authorization') || req.get('authorization');

  // 1. Check Session Cookie authentication first
  if (sidCookie && typeof sidCookie === 'string') {
    try {
      const sessionIdHash = crypto.createHash('sha256').update(sidCookie.trim()).digest('hex');
      const session = await sessionsDb.findSessionByHash(sessionIdHash);

      if (session) {
        // State-changing requests authenticated via session require CSRF & Origin validation
        const isStateChanging = ['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method.toUpperCase());

        if (isStateChanging) {
          // Origin / Referer validation
          const origin = req.get('Origin') || req.get('Referer');
          if (origin) {
            try {
              const parsedOrigin = new URL(origin).origin;
              if (!allowedOrigins.has(parsedOrigin)) {
                return res.status(403).json({
                  error: {
                    code: 'FORBIDDEN',
                    message: 'Invalid request origin'
                  }
                });
              }
            } catch (err) {
              return res.status(403).json({
                error: {
                  code: 'FORBIDDEN',
                  message: 'Invalid request origin'
                }
              });
            }
          }

          // CSRF Token validation
          const csrfToken = req.get('X-CSRF-Token') || req.get('x-csrf-token');
          if (!csrfToken || typeof csrfToken !== 'string') {
            return res.status(403).json({
              error: {
                code: 'CSRF_VALIDATION_FAILED',
                message: 'CSRF token missing'
              }
            });
          }

          const csrfTokenHash = crypto.createHash('sha256').update(csrfToken.trim()).digest('hex');
          if (csrfTokenHash !== session.csrf_token_hash) {
            return res.status(403).json({
              error: {
                code: 'CSRF_VALIDATION_FAILED',
                message: 'Invalid CSRF token'
              }
            });
          }
        }

        // Attach authenticated user identity
        req.user = {
          userId: session.user_id
        };
        req.authMethod = 'session';
        incrementMetric('session_auth_successes_total');
        return next();
      }

      // If session cookie was provided but invalid/expired, and NO authorization header was provided,
      // return 401 immediately without bypassing.
      if (!authHeader) {
        incrementMetric('session_auth_failures_total');
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }
    } catch (err) {
      console.error('Session authentication internal error:', err.message);
      if (!authHeader) {
        return res.status(500).json({
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error'
          }
        });
      }
    }
  }

  // 2. Fall back to Authorization: Bearer <key>
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    incrementMetric('api_key_auth_failures_total');
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }

  const rawApiKey = authHeader.substring(7).trim();

  if (!rawApiKey) {
    incrementMetric('api_key_auth_failures_total');
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }

  try {
    const apiKeyHash = crypto
      .createHash('sha256')
      .update(rawApiKey)
      .digest('hex');

    const user = await usersDb.findUserByApiKeyHash(apiKeyHash);

    if (!user) {
      incrementMetric('api_key_auth_failures_total');
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    req.user = {
      userId: user.user_id
    };
    req.authMethod = 'api_key';

    incrementMetric('api_key_auth_successes_total');
    return next();
  } catch (err) {
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
