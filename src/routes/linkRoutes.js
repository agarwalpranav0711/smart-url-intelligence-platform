const express = require('express');
const router = express.Router();
const authenticateApiKey = require('../middleware/auth');
const rateLimitByApiKey = require('../middleware/rateLimit');
const linkController = require('../controllers/linkController');

/**
 * POST /api/v1/links
 * Creates a short link for authenticated user (supports optional custom alias and optional expires_at).
 * Rate limited: 60 requests per 60 seconds per API key.
 */
router.post('/links', authenticateApiKey, rateLimitByApiKey, linkController.createLink);

/**
 * GET /api/v1/links
 * Retrieves a paginated list of short links owned by the authenticated user.
 */
router.get('/links', authenticateApiKey, linkController.listLinks);

/**
 * PATCH /api/v1/links/:code
 * Updates target_url and/or expires_at for a short link owned by the authenticated user.
 */
router.patch('/links/:code', authenticateApiKey, linkController.updateLink);

/**
 * DELETE /api/v1/links/:code
 * Soft-deactivates a short link owned by the authenticated user (is_active = false).
 */
router.delete('/links/:code', authenticateApiKey, linkController.deactivateLink);

module.exports = router;
