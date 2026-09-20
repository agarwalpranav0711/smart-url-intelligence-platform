const express = require('express');
const linkRoutes = require('./routes/linkRoutes');
const redirectRoutes = require('./routes/redirectRoutes');
const opsRoutes = require('./routes/opsRoutes');
const apiKeyRoutes = require('./routes/apiKeyRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const docsRoutes = require('./routes/docsRoutes');
const requestIdMiddleware = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const securityHeadersMiddleware = require('./middleware/securityHeaders');
const corsMiddleware = require('./middleware/cors');
const logger = require('./utils/logger');
const { incrementMetric } = require('./utils/metrics');
const { setShuttingDown } = require('./utils/shutdownState');
const { validateEnv } = require('./config/env');
const analyticsService = require('./services/analyticsService');

const app = express();

// Trust proxy setting (disabled by default, configurable in production per topology)
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
} else if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== 'false') {
  app.set('trust proxy', process.env.TRUST_PROXY);
} else {
  app.set('trust proxy', false);
}

// Security Hardening: Disable X-Powered-By header
app.disable('x-powered-by');

// 0. Security Headers & CORS Policy Middleware
app.use(securityHeadersMiddleware);
app.use(corsMiddleware);

// 1. Request correlation ID middleware (early execution for all endpoints)
app.use(requestIdMiddleware);

// 2. High-resolution request timing and structured request logging
app.use(requestLogger);

// 3. Enable JSON body parsing with strict 64 KB size limit
app.use(express.json({ limit: '64kb' }));

// 4. Register Public Operational & Documentation Routes
app.use('/', opsRoutes);
app.use('/', docsRoutes);

// 5. Register Public Redirect Route (GET /s/:code)
app.use('/', redirectRoutes);

// 6. Register Authenticated API Routes & Developer Identity Endpoints
app.use('/api/v1', apiKeyRoutes);
app.use('/api/v1', linkRoutes);
app.use('/api/v1', analyticsRoutes);

// 7. Unknown Route Handler (HTTP 404 JSON response for any unmapped route)
app.use((req, res) => {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found'
    }
  });
});

// 8. Express Global Error Handler (Payload size overflow, malformed JSON & unexpected server errors)
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    incrementMetric('payload_too_large_total');
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds maximum allowed size of 64KB'
      }
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    incrementMetric('validation_failures_total');
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
  try {
    validateEnv();
  } catch (err) {
    logger.error({ event: 'config.error', message: err.message });
    process.exit(1);
  }

  const { pool } = require('./config/db');
  const PORT = process.env.PORT || 3000;

  analyticsService.startFlushTimer();

  const server = app.listen(PORT, () => {
    logger.info({ event: 'server.started', port: PORT });
  });

  // Configure Node HTTP Server Socket Timeouts
  server.requestTimeout = 10000;
  server.headersTimeout = 11000;
  server.keepAliveTimeout = 5000;

  let shutdownInProgress = false;
  const handleShutdown = (signal) => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    setShuttingDown(true);

    logger.info({ event: 'server.shutdown', signal });
    server.close(async () => {
      try {
        await analyticsService.stopFlushTimer();
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
