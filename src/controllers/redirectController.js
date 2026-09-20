const linkService = require('../services/linkService');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');
const routingEngine = require('../services/routingEngine');
const analyticsService = require('../services/analyticsService');

/**
 * Controller for public short URL redirects (GET /s/:code).
 * Handles short link lookup, status verification (404/410 inactive/410 expired), rule evaluation, non-blocking click count updates, analytics buffer recording, and HTTP 302 redirects.
 */
async function handleRedirect(req, res) {
  // Reject HEAD method on /s/:code with HTTP 405 METHOD_NOT_ALLOWED (Allow: GET)
  if (req.method === 'HEAD') {
    incrementMetric('unsupported_method_total');
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method Not Allowed'
      }
    });
  }

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
    let routeType = 'fallback';
    let routeKey = 'fallback';
    try {
      const outcome = routingEngine.evaluateRoutingRulesWithDetails(link, req);
      destinationUrl = outcome.destinationUrl;
      routeType = outcome.routeType;
      routeKey = outcome.routeKey;
    } catch (routingErr) {
      logger.error({
        event: 'routing.error',
        requestId: req.id,
        operation: 'evaluate_routing',
        message: routingErr.message
      });
      incrementMetric('routing_evaluation_errors_total');
      destinationUrl = link.target_url;
      routeType = 'fallback';
      routeKey = 'fallback';
    }

    // 6. Schedule best-effort non-blocking click count increment and Step 22 analytics ingestion
    void linkService.recordClickAsync(code).catch((err) => {
      logger.error({ event: 'database.error', operation: 'click_count_increment', message: err.message });
    });

    try {
      analyticsService.recordEvent({
        shortCode: code,
        routeType,
        routeKey,
        destinationUrl,
      });
    } catch (analyticsErr) {
      logger.error({ event: 'analytics.error', message: analyticsErr.message });
    }

    incrementMetric('redirects_total');
    logger.info({ event: 'link.redirected' });

    // 7. Immediately return HTTP 302 Redirect with Cache-Control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
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
