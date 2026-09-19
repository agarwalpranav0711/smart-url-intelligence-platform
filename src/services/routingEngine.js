const crypto = require('crypto');
const { incrementMetric } = require('../utils/metrics');

/**
 * Heuristic device classification function based purely on HTTP User-Agent.
 * Stateless and deterministic. Never logs or collects client IP or persistent identifiers.
 *
 * @param {string} userAgent - Raw HTTP User-Agent header string
 * @returns {'mobile'|'tablet'|'desktop'|'unknown'} Classified device category
 */
function classifyDevice(userAgent) {
  if (!userAgent || typeof userAgent !== 'string' || userAgent.trim().length === 0) {
    return 'unknown';
  }

  const ua = userAgent.toLowerCase();

  // 1. Tablet check (iPad, PlayBook, Silk, or Android without Mobile)
  if (/ipad|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    return 'tablet';
  }

  // 2. Mobile check (iPhone, iPod, Android Mobile, BlackBerry, IEMobile, Opera Mini)
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return 'mobile';
  }

  // 3. Desktop check (Standard browser on Windows/Mac/Linux)
  return 'desktop';
}

/**
 * Returns formatted HH:mm time string and 3-letter weekday code in specified IANA timezone.
 *
 * @param {Date} date - Javascript Date instance
 * @param {string} [timeZone='UTC'] - Valid IANA timezone string
 * @returns {{ timeStr: string, dayStr: string }}
 */
function getZonedDateTimeInfo(date, timeZone = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  let hour = '00';
  let minute = '00';
  let dayStr = 'sun';

  for (const part of parts) {
    if (part.type === 'hour') {
      hour = part.value === '24' ? '00' : part.value;
    } else if (part.type === 'minute') {
      minute = part.value;
    } else if (part.type === 'weekday') {
      dayStr = part.value.toLowerCase().substring(0, 3);
    }
  }

  return {
    timeStr: `${hour}:${minute}`,
    dayStr,
  };
}

/**
 * Core Step 21 Routing Engine.
 * Evaluates configured rules sequentially in array order (time -> device -> weighted).
 * Safely falls back to routing_config.default or primary link.target_url if no rule matches.
 *
 * @param {Object} linkRecord - Link record containing target_url and routing_config
 * @param {Object} [req=null] - Express HTTP request object
 * @param {Date} [now=new Date()] - Date instance for time evaluation (testing override)
 * @returns {string} Evaluated destination URL for HTTP 302 redirect
 */
function evaluateRoutingRules(linkRecord, req = null, now = new Date()) {
  const config = linkRecord ? linkRecord.routing_config : null;

  if (!config) {
    return linkRecord.target_url;
  }

  incrementMetric('routing_evaluations_total');

  if (Array.isArray(config.rules) && config.rules.length > 0) {
    const userAgent = req && typeof req.get === 'function'
      ? (req.get('User-Agent') || req.get('user-agent') || '')
      : '';

    for (const rule of config.rules) {
      if (!rule || typeof rule !== 'object') continue;

      // A. Time-based Rule Evaluation
      if (rule.type === 'time') {
        const timezone = rule.timezone || 'UTC';
        const { timeStr, dayStr } = getZonedDateTimeInfo(now, timezone);

        // Check days array if specified
        if (Array.isArray(rule.days) && rule.days.length > 0) {
          const lowerDays = rule.days.map((d) => String(d).toLowerCase());
          if (!lowerDays.includes(dayStr)) {
            continue;
          }
        }

        const { start, end } = rule;
        let isMatch = false;

        if (start < end) {
          // Standard intraday interval [start, end)
          isMatch = (timeStr >= start && timeStr < end);
        } else if (start > end) {
          // Overnight interval spanning midnight (e.g. 22:00 to 06:00)
          isMatch = (timeStr >= start || timeStr < end);
        }

        if (isMatch) {
          incrementMetric('time_route_selected_total');
          return rule.target_url;
        }
      }

      // B. Device-based Rule Evaluation
      else if (rule.type === 'device') {
        const classifiedDevice = classifyDevice(userAgent);
        const allowedDevices = Array.isArray(rule.devices)
          ? rule.devices.map((d) => String(d).toLowerCase())
          : [];

        if (allowedDevices.includes(classifiedDevice)) {
          incrementMetric('device_route_selected_total');
          return rule.target_url;
        }
      }

      // C. Weighted-based Rule Evaluation
      else if (rule.type === 'weighted') {
        if (Array.isArray(rule.destinations) && rule.destinations.length > 0) {
          let totalWeight = 0;
          for (const dest of rule.destinations) {
            totalWeight += dest.weight || 0;
          }

          if (totalWeight > 0) {
            const rand = crypto.randomInt(0, totalWeight);
            let cumulative = 0;

            for (const dest of rule.destinations) {
              cumulative += dest.weight || 0;
              if (rand < cumulative) {
                incrementMetric('weighted_route_selected_total');
                return dest.target_url;
              }
            }
            incrementMetric('weighted_route_selected_total');
            return rule.destinations[0].target_url;
          }
        }
      }
    }
  }

  // Fallback: If no rule matched, use rule-level default target or primary link.target_url
  if (config.default && typeof config.default === 'string' && config.default.trim().length > 0) {
    return config.default;
  }

  return linkRecord.target_url;
}

module.exports = {
  classifyDevice,
  getZonedDateTimeInfo,
  evaluateRoutingRules,
};
