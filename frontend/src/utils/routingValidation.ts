import { RoutingConfig, DayCode } from '../api/types';

export const MAX_ROUTING_PAYLOAD_BYTES = 16384; // 16 KB
export const MAX_RULES_COUNT = 10;
export const MAX_URL_LENGTH = 2048;

export const ALLOWED_DAYS: DayCode[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const ALLOWED_DEVICES = ['mobile', 'tablet', 'desktop', 'unknown'] as const;

export function isValidHttpUrl(urlStr: string): boolean {
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

export function isValidIanaTimezone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.trim().length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (_) {
    return false;
  }
}

export function validateRoutingConfigClient(config: RoutingConfig | null | undefined): { valid: boolean; error?: string } {
  if (config === null || config === undefined) {
    return { valid: true };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, error: 'routing_config must be a JSON object' };
  }

  // Size limit check
  const jsonStr = JSON.stringify(config);
  const byteLength = new TextEncoder().encode(jsonStr).length;
  if (byteLength > MAX_ROUTING_PAYLOAD_BYTES) {
    return { valid: false, error: 'routing_config exceeds maximum size limit of 16 KB' };
  }

  // Validate default destination
  if (config.default !== undefined && config.default !== null && config.default.trim().length > 0) {
    if (!isValidHttpUrl(config.default)) {
      return { valid: false, error: 'Default destination must be a valid http or https URL under 2048 characters' };
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
      if (!rule || typeof rule !== 'object') {
        return { valid: false, error: `Rule at index ${i + 1} must be an object` };
      }

      if (!['time', 'device', 'weighted'].includes(rule.type)) {
        return { valid: false, error: `Rule at index ${i + 1} has unsupported type "${rule.type}"` };
      }

      // Time Rule
      if (rule.type === 'time') {
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (typeof rule.start !== 'string' || !timeRegex.test(rule.start)) {
          return { valid: false, error: `Time rule #${i + 1} has invalid start time (must be HH:mm, 00:00 - 23:59)` };
        }
        if (typeof rule.end !== 'string' || !timeRegex.test(rule.end)) {
          return { valid: false, error: `Time rule #${i + 1} has invalid end time (must be HH:mm, 00:00 - 23:59)` };
        }
        if (rule.start === rule.end) {
          return { valid: false, error: `Time rule #${i + 1} start and end times cannot be identical` };
        }

        if (rule.timezone !== undefined && rule.timezone !== null && rule.timezone.trim().length > 0) {
          if (!isValidIanaTimezone(rule.timezone)) {
            return { valid: false, error: `Time rule #${i + 1} has invalid IANA timezone "${rule.timezone}"` };
          }
        }

        if (rule.days !== undefined && rule.days !== null) {
          if (!Array.isArray(rule.days)) {
            return { valid: false, error: `Time rule #${i + 1} days must be an array` };
          }
          for (const d of rule.days) {
            if (typeof d !== 'string' || !ALLOWED_DAYS.includes(d as DayCode)) {
              return { valid: false, error: `Time rule #${i + 1} has invalid day code "${d}"` };
            }
          }
        }

        if (!isValidHttpUrl(rule.target_url)) {
          return { valid: false, error: `Time rule #${i + 1} target_url must be a valid http or https URL` };
        }
      }

      // Device Rule
      if (rule.type === 'device') {
        if (!Array.isArray(rule.devices) || rule.devices.length === 0) {
          return { valid: false, error: `Device rule #${i + 1} must contain at least one selected device category` };
        }
        for (const dev of rule.devices) {
          if (!ALLOWED_DEVICES.includes(dev as any)) {
            return { valid: false, error: `Device rule #${i + 1} has invalid device category "${dev}"` };
          }
        }
        if (!isValidHttpUrl(rule.target_url)) {
          return { valid: false, error: `Device rule #${i + 1} target_url must be a valid http or https URL` };
        }
      }

      // Weighted Rule
      if (rule.type === 'weighted') {
        if (!Array.isArray(rule.destinations) || rule.destinations.length < 2 || rule.destinations.length > 10) {
          return { valid: false, error: `Weighted rule #${i + 1} destinations must contain between 2 and 10 items` };
        }

        let totalWeight = 0;
        for (let j = 0; j < rule.destinations.length; j++) {
          const dest = rule.destinations[j];
          if (!dest || typeof dest !== 'object') {
            return { valid: false, error: `Weighted rule #${i + 1} destination ${j + 1} must be an object` };
          }
          if (!isValidHttpUrl(dest.target_url)) {
            return { valid: false, error: `Weighted rule #${i + 1} destination ${j + 1} target_url must be a valid URL` };
          }
          if (typeof dest.weight !== 'number' || !Number.isInteger(dest.weight) || dest.weight < 1 || dest.weight > 100) {
            return { valid: false, error: `Weighted rule #${i + 1} destination ${j + 1} weight must be an integer between 1 and 100` };
          }
          totalWeight += dest.weight;
        }

        if (totalWeight < 1 || totalWeight > 1000) {
          return { valid: false, error: `Weighted rule #${i + 1} total weight sum must be between 1 and 1000 (currently ${totalWeight})` };
        }
      }
    }
  }

  return { valid: true };
}
