const express = require('express');
const router = express.Router();
const authenticateApiKey = require('../middleware/auth');
const {
  rateLimitPublicRegistration,
  rateLimitApiKeyCreate,
  rateLimitApiKeyList,
  rateLimitApiKeyDelete
} = require('../middleware/rateLimit');
const { checkAllowedMethods } = require('../middleware/methodHandler');
const apiKeyController = require('../controllers/apiKeyController');
const { incrementMetric } = require('../utils/metrics');

function requireJsonContentType(req, res, next) {
  const contentType = req.get('Content-Type') || req.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    incrementMetric('validation_failures_total');
    return res.status(415).json({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json'
      }
    });
  }
  next();
}

router.route('/users')
  .all(checkAllowedMethods(['POST', 'OPTIONS']))
  .post(rateLimitPublicRegistration, requireJsonContentType, apiKeyController.registerDeveloper);

router.route('/api-keys')
  .all(checkAllowedMethods(['GET', 'POST', 'OPTIONS']))
  .get(authenticateApiKey, rateLimitApiKeyList, apiKeyController.listKeys)
  .post(authenticateApiKey, rateLimitApiKeyCreate, requireJsonContentType, apiKeyController.createKey);

router.route('/api-keys/:id')
  .all(checkAllowedMethods(['DELETE', 'OPTIONS']))
  .delete(authenticateApiKey, rateLimitApiKeyDelete, apiKeyController.revokeKey);

module.exports = router;
