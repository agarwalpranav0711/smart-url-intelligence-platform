const express = require('express');
const linkRoutes = require('./routes/linkRoutes');
const redirectRoutes = require('./routes/redirectRoutes');
const opsRoutes = require('./routes/opsRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const docsRoutes = require('./routes/docsRoutes');
const requestLogger = require('./middleware/requestLogger');
const logger = require('./utils/logger');

const app = express();

// Security Hardening: Disable X-Powered-By header
app.disable('x-powered-by');

// 1. High-resolution request timing and structured request logging
app.use(requestLogger);

// 2. Enable JSON body parsing
app.use(express.json());

// 3. Register Public Operational & Documentation Routes
app.use('/', opsRoutes);
app.use('/', docsRoutes);

// 4. Register Public Redirect Route (GET /s/:code)
app.use('/', redirectRoutes);

// 5. Register Authenticated API Routes & Developer Identity Endpoints
app.use('/api/v1', apiKeyRoutes);
app.use('/api/v1', linkRoutes);

// 6. Unknown Route Handler (HTTP 404 JSON response for any unmapped route)
app.use((req, res) => {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// 7. Express Global Error Handler (Malformed JSON & unexpected internal server errors)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Malformed JSON payload'
      }
    });
  }
  
  logger.error({ event: 'server.error', message: err.message });
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error'
    }
  });
});

// Server startup & graceful shutdown handlers when executed directly
if (require.main === module) {
  const { pool } = require('./config/db');
  const PORT = process.env.PORT || 3000;

  const server = app.listen(PORT, () => {
    logger.info({ event: 'server.started', port: PORT });
  });

  const handleShutdown = (signal) => {
    logger.info({ event: 'server.shutdown', signal });
    server.close(async () => {
      try {
        await pool.end();
        process.exit(0);
      } catch (err) {
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

module.exports = app;

