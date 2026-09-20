const express = require('express');
const router = express.Router();
const authenticateApiKey = require('../middleware/auth');
const {
  rateLimitLinkCreate,
  rateLimitLinkQuery,
  rateLimitLinkMutation,
  rateLimitLinkDelete
} = require('../middleware/rateLimit');
const parseIdempotencyHeader = require('../middleware/idempotency');
const { checkAllowedMethods } = require('../middleware/methodHandler');
const linkController = require('../controllers/linkController');
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

// Method handling & rate limiting for /links
router.route('/links')
  .all(checkAllowedMethods(['GET', 'POST', 'OPTIONS']))
  .get(authenticateApiKey, rateLimitLinkQuery, linkController.listLinks)
  .post(authenticateApiKey, rateLimitLinkCreate, requireJsonContentType, parseIdempotencyHeader, linkController.createLink);

// Method handling & rate limiting for /links/:code
router.route('/links/:code')
  .all(checkAllowedMethods(['PATCH', 'DELETE', 'OPTIONS']))
  .patch(authenticateApiKey, rateLimitLinkMutation, requireJsonContentType, linkController.updateLink)
  .delete(authenticateApiKey, rateLimitLinkDelete, linkController.deactivateLink);

module.exports = router;
