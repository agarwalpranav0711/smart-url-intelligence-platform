const analyticsService = require('../services/analyticsService');
const logger = require('../utils/logger');

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days limit

/**
 * Controller for retrieving per-link analytics (GET /api/v1/links/:code/analytics).
 * Enforces authenticated owner authorization, ISO-8601 timestamp validation, and max 90-day range.
 */
async function getLinkAnalytics(req, res) {
  const code = req.params.code;
  const userId = req.user.userId;

  let { from, to, interval = 'day' } = req.query;

  if (interval !== 'hour' && interval !== 'day') {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'interval must be either "hour" or "day"'
      }
    });
  }

  const now = new Date();
  let toDate = now;
  if (to !== undefined && to !== null && to !== '') {
    if (typeof to !== 'string' || isNaN(Date.parse(to))) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'to must be a valid ISO-8601 timestamp'
        }
      });
    }
    toDate = new Date(to);
  }

  let fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from !== undefined && from !== null && from !== '') {
    if (typeof from !== 'string' || isNaN(Date.parse(from))) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'from must be a valid ISO-8601 timestamp'
        }
      });
    }
    fromDate = new Date(from);
  }

  if (fromDate > toDate) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'from timestamp cannot be after to timestamp'
      }
    });
  }

  if ((toDate.getTime() - fromDate.getTime()) > MAX_RANGE_MS) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Date range cannot exceed 90 days'
      }
    });
  }

  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  try {
    const analytics = await analyticsService.getLinkAnalytics(code, userId, fromIso, toIso, interval);

    if (!analytics) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Short link not found'
        }
      });
    }

    return res.status(200).json(analytics);
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'get_link_analytics', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

/**
 * Controller for retrieving developer overall analytics summary and top links (GET /api/v1/analytics/summary).
 * Enforces authenticated owner authorization, limit bounds (1..50), and date validation.
 */
async function getAnalyticsSummary(req, res) {
  const userId = req.user.userId;
  let { from, to, limit = 10 } = req.query;

  let limitVal = 10;
  if (limit !== undefined && limit !== null && limit !== '') {
    const limitStr = String(limit);
    if (!/^\d+$/.test(limitStr)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'limit must be a positive integer between 1 and 50'
        }
      });
    }
    limitVal = parseInt(limitStr, 10);
    if (limitVal < 1 || limitVal > 50) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'limit must be between 1 and 50'
        }
      });
    }
  }

  const now = new Date();
  let toDate = now;
  if (to !== undefined && to !== null && to !== '') {
    if (typeof to !== 'string' || isNaN(Date.parse(to))) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'to must be a valid ISO-8601 timestamp'
        }
      });
    }
    toDate = new Date(to);
  }

  let fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from !== undefined && from !== null && from !== '') {
    if (typeof from !== 'string' || isNaN(Date.parse(from))) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'from must be a valid ISO-8601 timestamp'
        }
      });
    }
    fromDate = new Date(from);
  }

  if (fromDate > toDate) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'from timestamp cannot be after to timestamp'
      }
    });
  }

  if ((toDate.getTime() - fromDate.getTime()) > MAX_RANGE_MS) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Date range cannot exceed 90 days'
      }
    });
  }

  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  try {
    const summary = await analyticsService.getAnalyticsSummary(userId, fromIso, toIso, limitVal);
    return res.status(200).json(summary);
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'get_analytics_summary', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

module.exports = {
  getLinkAnalytics,
  getAnalyticsSummary,
};
