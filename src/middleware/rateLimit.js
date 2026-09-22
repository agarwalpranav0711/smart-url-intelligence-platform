const { rateLimit } = require('express-rate-limit');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

/**
 * Creates an Express rate limiter instance.
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs !== undefined ? options.windowMs : 60 * 1000;
  const max = options.max !== undefined ? options.max : 60;
  const keyGenerator = options.keyGenerator || ((req) => (req.user ? req.user.userId : 'anonymous'));
  const message = options.message || 'Too many requests';

  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => {
      incrementMetric('rate_limit_exceeded_total');
      logger.warn({
        event: 'rate_limit.exceeded',
        path: req.path,
        status: 429,
      });

      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
        }
      });
    },
  });
}

// 1. Process-local global sliding window limiter for public user registration (Zero IP Collection)
const rateLimitPublicRegistration = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
  keyGenerator: () => 'global_public_registration_process_window',
  message: 'Too many user registration requests'
});

// 2. Authenticated Rate Limiters by User ID
const rateLimitLinkCreate = createRateLimiter({ max: 60, message: 'Too many link creation requests' });
const rateLimitLinkQuery = createRateLimiter({ max: 120, message: 'Too many link query requests' });
const rateLimitLinkMutation = createRateLimiter({ max: 60, message: 'Too many link update requests' });
const rateLimitLinkDelete = createRateLimiter({ max: 30, message: 'Too many link deletion requests' });

const rateLimitApiKeyCreate = createRateLimiter({ max: 10, message: 'Too many API key creation requests' });
const rateLimitApiKeyList = createRateLimiter({ max: 60, message: 'Too many API key listing requests' });
const rateLimitApiKeyDelete = createRateLimiter({ max: 30, message: 'Too many API key deletion requests' });

const rateLimitAnalytics = createRateLimiter({ max: 30, message: 'Too many analytics query requests' });

const rateLimitSessionCreate = createRateLimiter({
  max: 15,
  windowMs: 60 * 1000,
  keyGenerator: () => 'global_public_session_process_window',
  message: 'Too many session creation requests'
});

function resetRateLimitersForTesting() {
  if (typeof rateLimitPublicRegistration.resetKey === 'function') {
    rateLimitPublicRegistration.resetKey('global_public_registration_process_window');
  }
  if (rateLimitPublicRegistration.store && typeof rateLimitPublicRegistration.store.resetKey === 'function') {
    rateLimitPublicRegistration.store.resetKey('global_public_registration_process_window');
  }
  if (typeof rateLimitSessionCreate.resetKey === 'function') {
    rateLimitSessionCreate.resetKey('global_public_session_process_window');
  }
  if (rateLimitSessionCreate.store && typeof rateLimitSessionCreate.store.resetKey === 'function') {
    rateLimitSessionCreate.store.resetKey('global_public_session_process_window');
  }
}

module.exports = rateLimitLinkCreate;
module.exports.createRateLimiter = createRateLimiter;
module.exports.rateLimitPublicRegistration = rateLimitPublicRegistration;
module.exports.rateLimitSessionCreate = rateLimitSessionCreate;
module.exports.rateLimitLinkCreate = rateLimitLinkCreate;
module.exports.rateLimitLinkQuery = rateLimitLinkQuery;
module.exports.rateLimitLinkMutation = rateLimitLinkMutation;
module.exports.rateLimitLinkDelete = rateLimitLinkDelete;
module.exports.rateLimitApiKeyCreate = rateLimitApiKeyCreate;
module.exports.rateLimitApiKeyList = rateLimitApiKeyList;
module.exports.rateLimitApiKeyDelete = rateLimitApiKeyDelete;
module.exports.rateLimitAnalytics = rateLimitAnalytics;
module.exports.resetRateLimitersForTesting = resetRateLimitersForTesting;
