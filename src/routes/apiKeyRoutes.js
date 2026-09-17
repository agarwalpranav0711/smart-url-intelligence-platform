const express = require('express');
const router = express.Router();
const authenticateApiKey = require('../middleware/auth');
const apiKeyController = require('../controllers/apiKeyController');

/**
 * Public Unauthenticated Developer Bootstrap Endpoint
 * POST /api/v1/users
 */
router.post('/users', apiKeyController.registerDeveloper);

/**
 * Authenticated API Key Management Endpoints
 * POST /api/v1/api-keys
 * GET /api/v1/api-keys
 * DELETE /api/v1/api-keys/:id
 */
router.post('/api-keys', authenticateApiKey, apiKeyController.createKey);
router.get('/api-keys', authenticateApiKey, apiKeyController.listKeys);
router.delete('/api-keys/:id', authenticateApiKey, apiKeyController.revokeKey);

module.exports = router;
