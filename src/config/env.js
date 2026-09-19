/**
 * Centralized environment configuration validator module.
 * Validates process environment variables without calling process.exit().
 * Throws clear Error objects on invalid configurations for testability.
 */
function validateEnv(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV "${nodeEnv}". Must be one of: development, production, test.`);
  }

  const portStr = env.PORT !== undefined ? String(env.PORT) : '3000';
  if (!/^\d+$/.test(portStr)) {
    throw new Error(`Invalid PORT "${env.PORT}". Must be a valid integer between 1 and 65535.`);
  }
  const port = parseInt(portStr, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid PORT ${port}. Must be between 1 and 65535.`);
  }

  const dbUrl = env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/url_shortener';
  let parsedUrl;
  try {
    parsedUrl = new URL(dbUrl);
  } catch (_) {
    throw new Error(`Invalid DATABASE_URL "${dbUrl}". Must be a valid URL.`);
  }
  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    throw new Error(`Invalid DATABASE_URL protocol "${parsedUrl.protocol}". Must use postgres:// or postgresql:// scheme.`);
  }

  const logLevel = env.LOG_LEVEL || 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL "${logLevel}". Must be one of: debug, info, warn, error.`);
  }

  if (env.RATE_LIMIT_WINDOW_MS !== undefined) {
    const wStr = String(env.RATE_LIMIT_WINDOW_MS);
    if (!/^\d+$/.test(wStr) || parseInt(wStr, 10) <= 0) {
      throw new Error(`Invalid RATE_LIMIT_WINDOW_MS "${env.RATE_LIMIT_WINDOW_MS}". Must be a positive integer.`);
    }
  }

  if (env.RATE_LIMIT_MAX_REQUESTS !== undefined) {
    const rStr = String(env.RATE_LIMIT_MAX_REQUESTS);
    if (!/^\d+$/.test(rStr) || parseInt(rStr, 10) <= 0) {
      throw new Error(`Invalid RATE_LIMIT_MAX_REQUESTS "${env.RATE_LIMIT_MAX_REQUESTS}". Must be a positive integer.`);
    }
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: dbUrl,
    LOG_LEVEL: logLevel,
    RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS ? parseInt(env.RATE_LIMIT_WINDOW_MS, 10) : 60000,
    RATE_LIMIT_MAX_REQUESTS: env.RATE_LIMIT_MAX_REQUESTS ? parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10) : 60,
  };
}

module.exports = {
  validateEnv,
};
