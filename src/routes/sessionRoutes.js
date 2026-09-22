const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { rateLimitSessionCreate } = require('../middleware/rateLimit');

// Web session lifecycle endpoints
router.post('/session', rateLimitSessionCreate, sessionController.createSession);
router.get('/session', sessionController.getSession);
router.delete('/session', sessionController.deleteSession);

module.exports = router;
