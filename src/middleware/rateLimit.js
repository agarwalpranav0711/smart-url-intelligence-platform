const { rateLimit } = require('express-rate-limit');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

/**
 * Creates an Express rate limiter instance for API keys.
 * Production default: 60 requests per 60 seconds per authenticated API key.
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs !== undefined
    ? options.windowMs
    : (process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) : 60 * 1000);

  const max = options.max !== undefined
    ? options.max
    : (process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) : 60);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user.userId,
    handler: (req, res, next, optionsHandler) => {
      incrementMetric('rate_limit_exceeded_total');
      logger.warn({
        event: 'rate_limit.exceeded',
        path: req.path,
        status: 429,
      });

      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many link creation requests'
        }
      });
    },
  });
}

// Export default production limiter instance (60 req / 60s)
const rateLimitByApiKey = createRateLimiter();

module.exports = rateLimitByApiKey;
module.exports.createRateLimiter = createRateLimiter;
