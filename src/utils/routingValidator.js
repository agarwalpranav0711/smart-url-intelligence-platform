/**
 * Validator module for Step 21 routing_config payloads.
 * Strictly enforces data schema, limits, time formats, device categories, and weight constraints.
 */

const MAX_PAYLOAD_BYTES = 16384; // 16 KB limit
const MAX_RULES_COUNT = 10;
const MAX_URL_LENGTH = 2048;
const ALLOWED_DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const ALLOWED_DEVICES = new Set(['mobile', 'tablet', 'desktop', 'unknown']);

function isValidUrl(urlStr) {
  if (typeof urlStr !== 'string' || urlStr.trim().length === 0 || urlStr.length > MAX_URL_LENGTH) {
    return false;
  }
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isValidIanaTimezone(tz) {
  if (typeof tz !== 'string' || tz.trim().length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

function validateRoutingConfig(config) {
  if (config === null || config === undefined) {
    return { valid: true, value: null };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, error: 'routing_config must be a JSON object' };
  }

  // Size limit check
  const jsonStr = JSON.stringify(config);
  if (Buffer.byteLength(jsonStr, 'utf8') > MAX_PAYLOAD_BYTES) {
    return { valid: false, error: 'routing_config exceeds maximum size limit of 16 KB' };
  }

  // Validate optional default destination
  if (config.default !== undefined && config.default !== null) {
    if (!isValidUrl(config.default)) {
      return { valid: false, error: 'default destination must be a valid http or https URL under 2048 characters' };
    }
  }

  // Validate rules array
  if (config.rules !== undefined && config.rules !== null) {
    if (!Array.isArray(config.rules)) {
      return { valid: false, error: 'rules must be an array' };
    }

    if (config.rules.length > MAX_RULES_COUNT) {
      return { valid: false, error: `rules array cannot exceed ${MAX_RULES_COUNT} rules` };
    }

    for (let i = 0; i < config.rules.length; i++) {
      const rule = config.rules[i];
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        return { valid: false, error: `Rule at index ${i} must be an object` };
      }

      if (!['time', 'device', 'weighted'].includes(rule.type)) {
        return { valid: false, error: `Rule at index ${i} has unsupported type "${rule.type}"` };
      }

      // 1. Time Rule Validation
      if (rule.type === 'time') {
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (typeof rule.start !== 'string' || !timeRegex.test(rule.start)) {
          return { valid: false, error: `Time rule at index ${i} has invalid start time format (must be HH:mm)` };
        }
        if (typeof rule.end !== 'string' || !timeRegex.test(rule.end)) {
          return { valid: false, error: `Time rule at index ${i} has invalid end time format (must be HH:mm)` };
        }
        if (rule.start === rule.end) {
          return { valid: false, error: `Time rule at index ${i} start and end times cannot be equal` };
        }

        if (rule.timezone !== undefined && rule.timezone !== null) {
          if (!isValidIanaTimezone(rule.timezone)) {
            return { valid: false, error: `Time rule at index ${i} has invalid IANA timezone "${rule.timezone}"` };
          }
        }

        if (rule.days !== undefined && rule.days !== null) {
          if (!Array.isArray(rule.days)) {
            return { valid: false, error: `Time rule at index ${i} days must be an array` };
          }
          for (const d of rule.days) {
            if (typeof d !== 'string' || !ALLOWED_DAYS.has(d.toLowerCase())) {
              return { valid: false, error: `Time rule at index ${i} has invalid day code "${d}"` };
            }
          }
        }

        if (!isValidUrl(rule.target_url)) {
          return { valid: false, error: `Time rule at index ${i} target_url must be a valid http or https URL` };
        }
      }

      // 2. Device Rule Validation
      if (rule.type === 'device') {
        if (!Array.isArray(rule.devices) || rule.devices.length === 0) {
          return { valid: false, error: `Device rule at index ${i} must contain a non-empty devices array` };
        }
        for (const dev of rule.devices) {
          if (typeof dev !== 'string' || !ALLOWED_DEVICES.has(dev.toLowerCase())) {
            return { valid: false, error: `Device rule at index ${i} has invalid device category "${dev}"` };
          }
        }
        if (!isValidUrl(rule.target_url)) {
          return { valid: false, error: `Device rule at index ${i} target_url must be a valid http or https URL` };
        }
      }

      // 3. Weighted Rule Validation
      if (rule.type === 'weighted') {
        if (!Array.isArray(rule.destinations) || rule.destinations.length < 2 || rule.destinations.length > 10) {
          return { valid: false, error: `Weighted rule at index ${i} destinations must contain between 2 and 10 items` };
        }

        let totalWeight = 0;
        for (let j = 0; j < rule.destinations.length; j++) {
          const dest = rule.destinations[j];
          if (!dest || typeof dest !== 'object') {
            return { valid: false, error: `Weighted rule at index ${i} destination ${j} must be an object` };
          }
          if (!isValidUrl(dest.target_url)) {
            return { valid: false, error: `Weighted rule at index ${i} destination ${j} target_url must be a valid URL` };
          }
          if (typeof dest.weight !== 'number' || !Number.isInteger(dest.weight) || dest.weight < 1 || dest.weight > 100) {
            return { valid: false, error: `Weighted rule at index ${i} destination ${j} weight must be an integer between 1 and 100` };
          }
          totalWeight += dest.weight;
        }

        if (totalWeight < 1 || totalWeight > 1000) {
          return { valid: false, error: `Weighted rule at index ${i} total weight sum must be between 1 and 1000` };
        }
      }
    }
  }

  return { valid: true, value: config };
}

module.exports = {
  validateRoutingConfig,
};
