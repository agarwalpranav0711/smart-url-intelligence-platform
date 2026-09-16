const { query } = require('../config/db');
const { getMetrics } = require('../utils/metrics');
const logger = require('../utils/logger');

/**
 * GET /health
 * Operational health check verifying process status and PostgreSQL dependency reachability.
 */
async function healthCheck(req, res) {
  try {
    // Lightweight parameterized ping query
    await query('SELECT 1');
    return res.status(200).json({
      status: 'ok'
    });
  } catch (err) {
    logger.error({
      event: 'database.error',
      operation: 'health_check',
      message: err.message,
    });
    return res.status(503).json({
      status: 'unhealthy'
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
  getMetricsSnapshot,
};
