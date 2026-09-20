const crypto = require('crypto');
const { incrementMetric } = require('../utils/metrics');

const VALID_IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Sorts object keys recursively to produce a canonical JSON string representation.
 */
function canonicalizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalizeObject);
  }

  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = canonicalizeObject(obj[key]);
  }
  return sortedObj;
}

/**
 * Step 23 Idempotency Header Parsing & Canonical Hash Middleware.
 */
function parseIdempotencyHeader(req, res, next) {
  const headerVal = req.get('Idempotency-Key') || req.get('idempotency-key');

  if (!headerVal) {
    return next();
  }

  const trimmedKey = headerVal.trim();
  if (!VALID_IDEMPOTENCY_KEY_REGEX.test(trimmedKey)) {
    incrementMetric('validation_failures_total');
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Idempotency-Key header must be between 1 and 64 alphanumeric, underscore, or hyphen characters'
      }
    });
  }

  const canonicalBody = canonicalizeObject(req.body || {});
  const requestHash = crypto
    .createHash('sha256')
    .update(`${req.path}:${JSON.stringify(canonicalBody)}`)
    .digest('hex');

  req.idempotency = {
    key: trimmedKey,
    hash: requestHash
  };

  next();
}

module.exports = parseIdempotencyHeader;
