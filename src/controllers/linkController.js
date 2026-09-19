const linkService = require('../services/linkService');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');
const { validateRoutingConfig } = require('../utils/routingValidator');

/**
 * Controller for creating short links (POST /api/v1/links).
 * Supports optional custom alias, optional expires_at timestamp, and optional routing_config.
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

  const { target_url: targetUrl, alias, expires_at: expiresAt, routing_config: routingConfig } = req.body;

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

  // 6. Validate optional custom alias format and length (3-32 chars, a-z, A-Z, 0-9, -, _)
  let validAlias = null;
  if (alias !== undefined && alias !== null) {
    if (typeof alias !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(alias)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Alias must be 3-32 characters long and contain only letters, numbers, hyphens, and underscores'
        }
      });
    }
    validAlias = alias;
  }

  // 7. Validate optional expires_at (must be valid future ISO-8601 timestamp)
  let validExpiresAt = null;
  if (expiresAt !== undefined && expiresAt !== null) {
    if (typeof expiresAt !== 'string' || isNaN(Date.parse(expiresAt))) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'expires_at must be a valid ISO-8601 timestamp'
        }
      });
    }
    const parsedExp = new Date(expiresAt);
    if (parsedExp <= new Date()) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'expires_at must be a future timestamp'
        }
      });
    }
    validExpiresAt = parsedExp.toISOString();
  }

  // 8. Validate optional routing_config
  let validRoutingConfig = null;
  if (routingConfig !== undefined && routingConfig !== null) {
    const valResult = validateRoutingConfig(routingConfig);
    if (!valResult.valid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: valResult.error
        }
      });
    }
    validRoutingConfig = valResult.value;
  }

  // 9. Extract authenticated user ownership (ignoring any user_id in req.body)
  const userId = req.user.userId;

  try {
    const link = await linkService.createShortLink(targetUrl, userId, validAlias, validExpiresAt, validRoutingConfig);

    incrementMetric('link_creations_total');
    logger.info({ event: 'link.created' });

    return res.status(201).json({
      short_code: link.short_code,
      target_url: link.target_url,
      created_at: link.created_at,
      expires_at: link.expires_at || null,
      routing_config: link.routing_config || null
    });
  } catch (err) {
    if (err.code === 'ALIAS_ALREADY_EXISTS') {
      incrementMetric('alias_conflicts_total');
      return res.status(409).json({
        error: {
          code: 'ALIAS_ALREADY_EXISTS',
          message: 'The requested alias is already in use'
        }
      });
    }

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
 * Controller for editing short link target URL, expiration, or routing_config (PATCH /api/v1/links/:code).
 * Only the owner may edit. Invalidates process-local redirect cache.
 */
async function updateLink(req, res) {
  const code = req.params.code;
  const userId = req.user.userId;

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body must be a JSON object'
      }
    });
  }

  const { target_url: targetUrl, expires_at: expiresAt, routing_config: routingConfig } = req.body;

  if (targetUrl === undefined && expiresAt === undefined && routingConfig === undefined) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Must provide target_url, expires_at, or routing_config to update'
      }
    });
  }

  const updateFields = {};

  // Validate targetUrl if provided
  if (targetUrl !== undefined) {
    if (typeof targetUrl !== 'string' || targetUrl.trim().length === 0 || targetUrl.length > 2048) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'target_url must be a valid non-empty string under 2048 characters'
        }
      });
    }
    try {
      const parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Only http and https URL schemes are allowed'
          }
        });
      }
    } catch (_) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'target_url must be a valid URL'
        }
      });
    }
    updateFields.targetUrl = targetUrl;
  }

  // Validate expiresAt if provided
  if (expiresAt !== undefined && expiresAt !== null) {
    if (typeof expiresAt !== 'string' || isNaN(Date.parse(expiresAt))) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'expires_at must be a valid ISO-8601 timestamp'
        }
      });
    }
    const parsedExp = new Date(expiresAt);
    if (parsedExp <= new Date()) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'expires_at must be a future timestamp'
        }
      });
    }
    updateFields.expiresAt = parsedExp.toISOString();
  } else if (expiresAt === null) {
    updateFields.expiresAt = null;
  }

  // Validate routingConfig if provided
  if (routingConfig !== undefined) {
    if (routingConfig === null) {
      updateFields.routingConfig = null;
    } else {
      const valResult = validateRoutingConfig(routingConfig);
      if (!valResult.valid) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: valResult.error
          }
        });
      }
      updateFields.routingConfig = valResult.value;
    }
  }

  try {
    const updated = await linkService.updateLink(code, userId, updateFields);

    if (!updated) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Short link not found'
        }
      });
    }

    return res.status(200).json({
      short_code: updated.short_code,
      target_url: updated.target_url,
      is_active: updated.is_active,
      created_at: updated.created_at,
      expires_at: updated.expires_at || null,
      routing_config: updated.routing_config || null
    });
  } catch (err) {
    logger.error({ event: 'database.error', operation: 'update_link', message: err.message });
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

  const userId = req.user.userId;

  try {
    const rawLinks = await linkService.getUserLinks(userId, limitVal, offsetVal);

    const formattedLinks = rawLinks.map((link) => ({
      short_code: link.short_code,
      target_url: link.target_url,
      click_count: Number(link.click_count),
      is_active: link.is_active,
      created_at: link.created_at,
      expires_at: link.expires_at || null,
      routing_config: link.routing_config || null
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
  updateLink,
  listLinks,
  deactivateLink,
};
