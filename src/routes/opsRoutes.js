const express = require('express');
const router = express.Router();
const opsController = require('../controllers/opsController');

/**
 * Public Operational Routes (NOT under /api/v1)
 * GET /health
 * GET /metrics
 */
router.get('/health', opsController.healthCheck);
router.get('/metrics', opsController.getMetricsSnapshot);

module.exports = router;
