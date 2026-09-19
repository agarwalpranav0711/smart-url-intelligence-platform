const linkService = require('../services/linkService');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

/**
 * Controller for public short URL redirects (GET /s/:code).
 * Handles short link lookup, status verification (404/410 inactive/410 expired), non-blocking click count updates, and HTTP 302 redirects.
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

    // 3. Inactive short link -> HTTP 410 LINK_INACTIVE
    if (!link.is_active) {
      incrementMetric('redirect_inactive_total');
      return res.status(410).json({
        error: {
          code: 'LINK_INACTIVE',
          message: 'Short link is inactive'
        }
      });
    }

    // 4. Expired short link -> HTTP 410 LINK_EXPIRED (Evaluated at redirect time)
    if (link.expires_at && new Date(link.expires_at) <= new Date()) {
      incrementMetric('redirect_expired_total');
      return res.status(410).json({
        error: {
          code: 'LINK_EXPIRED',
          message: 'Short link has expired'
        }
      });
    }

    // 5. Schedule best-effort non-blocking click count increment
    void linkService.recordClickAsync(code).catch((err) => {
      logger.error({ event: 'database.error', operation: 'click_count_increment', message: err.message });
    });

    incrementMetric('redirects_total');
    logger.info({ event: 'link.redirected' });

    // 6. Immediately return HTTP 302 Redirect to Location: target_url
    return res.redirect(302, link.target_url);
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
