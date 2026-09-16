const linkService = require('../services/linkService');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

/**
 * Controller for creating short links (POST /api/v1/links).
 */
async function createLink(req, res) {
  // 1. Validate request body presence and type
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body must be a JSON object'
      }
    });
  }

  const { target_url: targetUrl } = req.body;

  // 2. Validate target_url type, presence, and non-whitespace content
  if (typeof targetUrl !== 'string' || targetUrl.trim().length === 0) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'target_url must be a non-empty string'
      }
    });
  }

  // 3. Enforce maximum 2048-character length limit
  if (targetUrl.length > 2048) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'target_url exceeds maximum length of 2048 characters'
      }
    });
  }

  // 4. Validate URL syntax using WHATWG URL parser
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (err) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'target_url must be a valid URL'
      }
    });
  }

  // 5. Restrict allowed URL schemes strictly to http: and https:
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Only http and https URL schemes are allowed'
      }
    });
  }

  // 6. Extract authenticated user ownership (ignoring any user_id in req.body)
  const userId = req.user.userId;

  try {
    // 7. Invoke link creation service (storing original un-normalized targetUrl)
    const link = await linkService.createShortLink(targetUrl, userId);

    incrementMetric('link_creations_total');
    logger.info({ event: 'link.created' });

    return res.status(201).json({
      short_code: link.short_code,
      target_url: link.target_url,
      created_at: link.created_at
    });
  } catch (err) {
    incrementMetric('link_creation_errors_total');
    logger.error({ event: 'database.error', operation: 'create_link', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

/**
 * Controller for listing authenticated user's short links (GET /api/v1/links).
 * Supports pagination via limit and offset query parameters.
 */
async function listLinks(req, res) {
  let limitVal = 20;
  let offsetVal = 0;

  // 1. Validate limit query parameter
  if (req.query.limit !== undefined) {
    const limitStr = String(req.query.limit);
    if (!/^\d+$/.test(limitStr)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid limit'
        }
      });
    }
    limitVal = parseInt(limitStr, 10);
    if (limitVal < 1 || limitVal > 100) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid limit'
        }
      });
    }
  }

  // 2. Validate offset query parameter
  if (req.query.offset !== undefined) {
    const offsetStr = String(req.query.offset);
    if (!/^\d+$/.test(offsetStr)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid offset'
        }
      });
    }
    offsetVal = parseInt(offsetStr, 10);
    if (offsetVal < 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid offset'
        }
      });
    }
  }

  // 3. Extract authenticated user ID (never trust user_id in query params)
  const userId = req.user.userId;

  try {
    // 4. Retrieve paginated links from service layer
    const rawLinks = await linkService.getUserLinks(userId, limitVal, offsetVal);

    // 5. Format response rows cleanly
    const formattedLinks = rawLinks.map((link) => ({
      short_code: link.short_code,
      target_url: link.target_url,
      click_count: Number(link.click_count),
      is_active: link.is_active,
      created_at: link.created_at
    }));

    return res.status(200).json({
      links: formattedLinks,
      limit: limitVal,
      offset: offsetVal
    });
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'list_links', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

/**
 * Controller for soft-deactivating a short link (DELETE /api/v1/links/:code).
 * Sets is_active = false for authenticated owner's link without physically deleting the database row.
 */
async function deactivateLink(req, res) {
  const code = req.params.code;
  const userId = req.user.userId;

  try {
    const result = await linkService.deactivateLink(code, userId);

    if (result.status === 'NOT_FOUND') {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Short link not found'
        }
      });
    }

    if (result.status === 'DEACTIVATED') {
      incrementMetric('deactivations_total');
      logger.info({ event: 'link.deactivated' });
    }

    // Both 'DEACTIVATED' and 'ALREADY_INACTIVE' return HTTP 200 (Idempotent)
    return res.status(200).json({
      message: 'Link deactivated'
    });
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'deactivate_link', message: err.message });
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    });
  }
}

module.exports = {
  createLink,
  listLinks,
  deactivateLink,
};
