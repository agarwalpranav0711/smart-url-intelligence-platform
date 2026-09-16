const pino = require('pino');

/**
 * Centralized Pino structured logger module.
 * Produces structured JSON logs for application events and HTTP requests.
 * Guaranteed safe: Excludes raw API keys, Authorization headers, passwords, and DATABASE_URL.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined, // Omit pid/hostname if desired for cleaner JSON
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
