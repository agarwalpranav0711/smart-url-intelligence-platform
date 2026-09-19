const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

/**
 * Express Middleware: Measures request duration, tracks HTTP status metrics, and outputs structured request completion logs.
 * Guaranteed safe: Excludes authorization headers, raw API keys, and client IPs.
 */
function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number((endTime - startTime) / 1_000_000n);

    const statusCode = res.statusCode;

    // Increment high-level HTTP status metrics
    if (statusCode >= 400 && statusCode < 500) {
      incrementMetric('http_4xx_total');
    } else if (statusCode >= 500) {
      incrementMetric('http_5xx_total');
    }

    // Emit structured request completion log
    logger.info({
      event: 'request.completed',
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: statusCode,
      duration_ms: durationMs,
    });
  });

  next();
}

module.exports = requestLogger;
