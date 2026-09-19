const db = require('../config/db');
const { getMetrics } = require('../utils/metrics');
const { getShuttingDown } = require('../utils/shutdownState');
const logger = require('../utils/logger');

/**
 * GET /health
 * Pure process liveness check. Does NOT query PostgreSQL.
 */
function healthCheck(req, res) {
  return res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
  });
}

/**
 * GET /ready
 * Readiness-oriented check verifying application active status and PostgreSQL connectivity.
 */
async function readinessCheck(req, res) {
  if (getShuttingDown()) {
    return res.status(503).json({
      status: 'not_ready'
    });
  }

  try {
    await db.query('SELECT 1');
    return res.status(200).json({
      status: 'ready'
    });
  } catch (err) {
    logger.error({
      event: 'database.error',
      operation: 'readiness_check',
      message: err.message,
    });
    return res.status(503).json({
      status: 'not_ready'
    });
  }
}

/**
 * GET /metrics
 * Internal operational metrics endpoint returning process-local counter snapshot.
 */
function getMetricsSnapshot(req, res) {
  return res.status(200).json(getMetrics());
}

module.exports = {
  healthCheck,
  readinessCheck,
  getMetricsSnapshot,
};
