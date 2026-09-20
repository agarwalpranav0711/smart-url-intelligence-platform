const { incrementMetric } = require('../utils/metrics');

/**
 * Step 23 HTTP Method Handler & Unsupported Method Rejection Middleware.
 * Enforces method permissions for API routes and public redirect endpoint.
 */
function checkAllowedMethods(allowedMethods) {
  return (req, res, next) => {
    if (allowedMethods.includes(req.method)) {
      return next();
    }

    incrementMetric('unsupported_method_total');
    res.setHeader('Allow', allowedMethods.join(', '));
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method Not Allowed'
      }
    });
  };
}

module.exports = {
  checkAllowedMethods,
};
