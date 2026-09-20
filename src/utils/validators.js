const { validateRoutingConfig } = require('./routingValidator');

/**
 * Centralized Input Validation Helpers for Step 23 Platform Hardening.
 * Preserves all existing Step 19/21/22 validation semantics.
 */

/**
 * Validates a target URL string.
 * Must be string, max 2048 chars, http:// or https:// scheme.
 * Rejects javascript:, data:, file:, blob:, vbscript: schemes.
 */
function validateTargetUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return { valid: false, message: 'target_url must be a string up to 2048 characters' };
  }

  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return { valid: false, message: 'target_url scheme is not allowed' };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, message: 'target_url must use http or https protocol' };
    }
  } catch (err) {
    return { valid: false, message: 'target_url must be a valid absolute URL' };
  }

  return { valid: true };
}

/**
 * Validates a custom short link alias string.
 * Must be string, 3..32 chars, matching /^[a-zA-Z0-9_-]+$/.
 */
function validateAlias(alias) {
  if (typeof alias !== 'string' || alias.length < 3 || alias.length > 32) {
    return { valid: false, message: 'custom_code must be between 3 and 32 characters long' };
  }

  const aliasRegex = /^[a-zA-Z0-9_-]+$/;
  if (!aliasRegex.test(alias)) {
    return { valid: false, message: 'custom_code can only contain alphanumeric characters, underscores, and hyphens' };
  }

  return { valid: true };
}

/**
 * Validates analytics query parameters.
 * from, to must be valid ISO dates, from <= to, range <= 90 days.
 * interval must be 'hour' or 'day'.
 * limit must be integer 1..50.
 */
function validateAnalyticsParams(query) {
  const { from, to, interval = 'day', limit = 10 } = query;

  let fromDate = null;
  let toDate = null;

  if (from) {
    const t = Date.parse(from);
    if (isNaN(t)) {
      return { valid: false, message: 'from parameter must be a valid ISO-8601 date string' };
    }
    fromDate = new Date(t);
  }

  if (to) {
    const t = Date.parse(to);
    if (isNaN(t)) {
      return { valid: false, message: 'to parameter must be a valid ISO-8601 date string' };
    }
    toDate = new Date(t);
  }

  if (fromDate && toDate && fromDate > toDate) {
    return { valid: false, message: 'from date must be less than or equal to to date' };
  }

  if (fromDate && toDate) {
    const rangeMs = toDate.getTime() - fromDate.getTime();
    const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
    if (rangeMs > maxRangeMs) {
      return { valid: false, message: 'date range must not exceed 90 days' };
    }
  }

  if (interval !== 'hour' && interval !== 'day') {
    return { valid: false, message: 'interval must be either "hour" or "day"' };
  }

  const parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    return { valid: false, message: 'limit must be an integer between 1 and 50' };
  }

  return { valid: true, fromDate, toDate, interval, limit: parsedLimit };
}

/**
 * Validates a user or API key name string.
 * Must be string, 1..64 chars.
 */
function validateName(name, fieldName = 'name') {
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 64) {
    return { valid: false, message: `${fieldName} must be a non-empty string up to 64 characters` };
  }
  return { valid: true };
}

module.exports = {
  validateTargetUrl,
  validateAlias,
  validateRoutingConfig,
  validateAnalyticsParams,
  validateUserName: (name) => validateName(name, 'user_name'),
  validateKeyName: (name) => validateName(name, 'key_name'),
};
