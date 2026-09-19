const crypto = require('crypto');

const VALID_REQUEST_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Express Middleware: Inspects or generates a request correlation ID (X-Request-ID).
 * Accepts client-supplied X-Request-ID header ONLY if matching safe alphanumeric format.
 * Generates crypto.randomUUID() if missing or invalid.
 */
function requestIdMiddleware(req, res, next) {
  const incomingId = req.get('X-Request-ID') || req.get('x-request-id');
  let requestId;

  if (incomingId && VALID_REQUEST_ID_REGEX.test(incomingId)) {
    requestId = incomingId;
  } else {
    requestId = crypto.randomUUID();
  }

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

module.exports = requestIdMiddleware;
