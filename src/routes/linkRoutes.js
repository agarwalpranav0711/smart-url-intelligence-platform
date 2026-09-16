const express = require('express');
const router = express.Router();
const authenticateApiKey = require('../middleware/auth');
const rateLimitByApiKey = require('../middleware/rateLimit');
const linkController = require('../controllers/linkController');

/**
 * POST /api/v1/links
 * Creates a short link for authenticated user.
 * Rate limited: 60 requests per 60 seconds per API key.
 */
router.post('/links', authenticateApiKey, rateLimitByApiKey, linkController.createLink);

/**
 * GET /api/v1/links
 * Retrieves a paginated list of short links owned by the authenticated user.
 * (NOT rate limited by Step 8).
 */
router.get('/links', authenticateApiKey, linkController.listLinks);

/**
 * DELETE /api/v1/links/:code
 * Soft-deactivates a short link owned by the authenticated user (is_active = false).
 * (NOT rate limited by Step 8).
 */
router.delete('/links/:code', authenticateApiKey, linkController.deactivateLink);

module.exports = router;
