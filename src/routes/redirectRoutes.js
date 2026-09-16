const express = require('express');
const router = express.Router();
const redirectController = require('../controllers/redirectController');

/**
 * Public Redirect Route
 * GET /s/:code
 * Publicly accessible - NO authentication middleware applied.
 */
router.get('/s/:code', redirectController.handleRedirect);

module.exports = router;
