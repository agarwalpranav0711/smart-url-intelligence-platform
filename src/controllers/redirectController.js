const linkService = require('../services/linkService');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');
const routingEngine = require('../services/routingEngine');

/**
 * Controller for public short URL redirects (GET /s/:code).
 * Handles short link lookup, status verification (404/410 inactive/410 expired), rule evaluation, non-blocking click count updates, and HTTP 302 redirects.
 */
async function handleRedirect(req, res) {
  const code = req.params.code;

  try {
    // 1. Look up link in PostgreSQL database or process-local LRU cache
    const link = await linkService.getLinkByCode(code);

    // 2. Unknown short code -> HTTP 404 NOT_FOUND
    if (!link) {
      incrementMetric('redirect_not_found_total');
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Short link not found'
        }
      });
    }

    // 3. Deactivated link -> HTTP 410 LINK_INACTIVE
    if (!link.is_active) {
      incrementMetric('redirect_inactive_total');
      return res.status(410).json({
        error: {
          code: 'LINK_INACTIVE',
          message: 'Short link is inactive'
        }
      });
    }

    // 4. Expired link -> HTTP 410 LINK_EXPIRED
    if (link.expires_at && new Date(link.expires_at) <= new Date()) {
      incrementMetric('redirect_expired_total');
      return res.status(410).json({
        error: {
          code: 'LINK_EXPIRED',
          message: 'Short link has expired'
        }
      });
    }

    // 5. Evaluate Step 21 Routing Rules with safe fallback to link.target_url
    let destinationUrl = link.target_url;
    try {
      destinationUrl = routingEngine.evaluateRoutingRules(link, req);
    } catch (routingErr) {
      logger.error({
        event: 'routing.error',
        requestId: req.id,
        operation: 'evaluate_routing',
        message: routingErr.message
      });
      incrementMetric('routing_evaluation_errors_total');
      destinationUrl = link.target_url;
    }

    // 6. Schedule best-effort non-blocking click count increment
    void linkService.recordClickAsync(code).catch((err) => {
      logger.error({ event: 'database.error', operation: 'click_count_increment', message: err.message });
    });

    incrementMetric('redirects_total');
    logger.info({ event: 'link.redirected' });

    // 7. Immediately return HTTP 302 Redirect to Location: destinationUrl
    return res.redirect(302, destinationUrl);
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'redirect_lookup', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

module.exports = {
  handleRedirect,
};
