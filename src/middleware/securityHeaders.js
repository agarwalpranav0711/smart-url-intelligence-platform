/**
 * Step 23 Security Headers Middleware.
 * Applies standard security headers to API and redirect responses.
 * Preserves Swagger UI functionality on /docs.
 */
function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');

  // Emit HSTS header strictly when explicitly enabled for production HTTPS deployments
  if (process.env.ENABLE_HSTS === 'true' || (req.secure && process.env.NODE_ENV === 'production')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Apply restrictive API Content-Security-Policy to REST routes, excluding Swagger UI assets on /docs
  if (!req.path.startsWith('/docs')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
  }

  next();
}

module.exports = securityHeadersMiddleware;
