const express = require('express');
const router = express.Router();
const authenticateApiKey = require('../middleware/auth');
const { rateLimitAnalytics } = require('../middleware/rateLimit');
const { checkAllowedMethods } = require('../middleware/methodHandler');
const analyticsController = require('../controllers/analyticsController');

router.route('/links/:code/analytics')
  .all(checkAllowedMethods(['GET', 'OPTIONS']))
  .get(authenticateApiKey, rateLimitAnalytics, analyticsController.getLinkAnalytics);

router.route('/analytics/summary')
  .all(checkAllowedMethods(['GET', 'OPTIONS']))
  .get(authenticateApiKey, rateLimitAnalytics, analyticsController.getAnalyticsSummary);

module.exports = router;
