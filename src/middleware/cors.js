/**
 * Step 23 CORS Policy Middleware.
 * Provides wildcard origin CORS for API integration without credentials.
 */
function corsMiddleware(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-ID, Idempotency-Key');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, Idempotency-Replayed, Location');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
}

module.exports = corsMiddleware;
