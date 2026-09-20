const { query } = require('../config/db');
const linksDb = require('../db/links');
const logger = require('../utils/logger');
const { incrementMetric } = require('../utils/metrics');

const MAX_BUFFER_ENTRIES = 10000;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;

let analyticsBuffer = new Map();
let flushTimer = null;

/**
 * Truncates a Date object to UTC hour boundary ISO-8601 string.
 * e.g., 2026-09-19T15:34:27.123Z -> 2026-09-19T15:00:00.000Z
 */
function getUtcHourBucket(date = new Date()) {
  const d = new Date(date);
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    0, 0, 0
  )).toISOString();
}

/**
 * Pushes an analytics redirect outcome event into the bounded process-local in-memory buffer.
 * Performs in-memory aggregation by key. Never blocks or delays the HTTP redirect.
 *
 * @param {Object} event
 * @param {string} event.shortCode
 * @param {string} [event.routeType='default']
 * @param {string} [event.routeKey='default']
 * @param {string} event.destinationUrl
 * @param {Date} [event.now=new Date()]
 */
function recordEvent({ shortCode, routeType = 'default', routeKey = 'default', destinationUrl, now = new Date() }) {
  if (!shortCode || !destinationUrl) return;

  const bucketStart = getUtcHourBucket(now);
  const compositeKey = `${shortCode}|${bucketStart}|${routeType}|${routeKey}|${destinationUrl}`;

  if (analyticsBuffer.has(compositeKey)) {
    const existing = analyticsBuffer.get(compositeKey);
    existing.count += 1;
  } else {
    if (analyticsBuffer.size >= MAX_BUFFER_ENTRIES) {
      incrementMetric('analytics_buffer_overflow_total');
      logger.warn({
        event: 'analytics.buffer_overflow',
        shortCode,
        message: 'Analytics buffer reached max capacity limit, dropping analytics event'
      });
      return;
    }

    analyticsBuffer.set(compositeKey, {
      shortCode,
      bucketStart,
      routeType,
      routeKey,
      destinationUrl,
      count: 1,
    });
  }

  incrementMetric('analytics_events_buffered_total');
}

/**
 * Flushes all accumulated in-memory analytics buffer events to PostgreSQL in a single bulk UPSERT.
 *
 * @returns {Promise<number>} Number of analytics records/clicks flushed
 */
async function flushBuffer() {
  if (analyticsBuffer.size === 0) {
    return 0;
  }

  // Snapshot and clear current buffer
  const snapshot = Array.from(analyticsBuffer.values());
  analyticsBuffer.clear();

  incrementMetric('analytics_flushes_total');

  // Sort keys deterministically to reduce PostgreSQL row-lock deadlock potential across app instances
  snapshot.sort((a, b) => {
    const kA = `${a.shortCode}|${a.bucketStart}|${a.routeType}|${a.routeKey}`;
    const kB = `${b.shortCode}|${b.bucketStart}|${b.routeType}|${b.routeKey}`;
    return kA.localeCompare(kB);
  });

  // Construct bulk SQL UPSERT statement
  const valueRows = [];
  const params = [];
  let paramIdx = 1;

  for (const item of snapshot) {
    valueRows.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
    params.push(item.shortCode, item.bucketStart, item.routeType, item.routeKey, item.destinationUrl, item.count);
  }

  const sql =
    'INSERT INTO link_analytics_hourly (short_code, bucket_start, route_type, route_key, destination_url, click_count) ' +
    `VALUES ${valueRows.join(', ')} ` +
    'ON CONFLICT (short_code, bucket_start, route_type, route_key) ' +
    'DO UPDATE SET click_count = link_analytics_hourly.click_count + EXCLUDED.click_count;';

  try {
    const result = await query(sql, params);
    const rowsWritten = snapshot.length;
    for (let i = 0; i < rowsWritten; i++) {
      incrementMetric('analytics_rows_written_total');
    }
    return snapshot.reduce((sum, item) => sum + item.count, 0);
  } catch (err) {
    incrementMetric('analytics_flush_errors_total');
    logger.error({
      event: 'analytics.flush_error',
      message: err.message
    });

    // Re-merge snapshot back into buffer up to MAX_BUFFER_ENTRIES capacity limit
    for (const item of snapshot) {
      if (analyticsBuffer.size >= MAX_BUFFER_ENTRIES) {
        incrementMetric('analytics_buffer_overflow_total');
        break;
      }
      const compositeKey = `${item.shortCode}|${item.bucketStart}|${item.routeType}|${item.routeKey}|${item.destinationUrl}`;
      if (analyticsBuffer.has(compositeKey)) {
        analyticsBuffer.get(compositeKey).count += item.count;
      } else {
        analyticsBuffer.set(compositeKey, item);
      }
    }

    return 0;
  }
}

/**
 * Starts the periodic background flush timer.
 *
 * @param {number} [intervalMs=5000] - Flush interval in milliseconds
 */
function startFlushTimer(intervalMs = DEFAULT_FLUSH_INTERVAL_MS) {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushBuffer();
  }, intervalMs);
  if (flushTimer.unref) {
    flushTimer.unref();
  }
}

/**
 * Stops the background flush timer and executes a clean final flush attempt.
 */
async function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushBuffer();
}

/**
 * Returns current snapshot of the in-memory buffer (for testing/inspection).
 */
function getBufferSnapshot() {
  return Array.from(analyticsBuffer.values());
}

/**
 * Clears the in-memory buffer (for testing isolation).
 */
function resetBufferForTesting() {
  analyticsBuffer.clear();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Retrieves per-link traffic analytics and routing breakdown for a specific short code.
 *
 * @param {string} shortCode - Short link code
 * @param {string} userId - UUID of authenticated owner
 * @param {string} fromIso - UTC ISO-8601 start timestamp
 * @param {string} toIso - UTC ISO-8601 end timestamp
 * @param {'hour'|'day'} interval - Grouping interval
 * @returns {Promise<Object|null>} Analytics data or null if link not found/unowned
 */
async function getLinkAnalytics(shortCode, userId, fromIso, toIso, interval = 'day') {
  // 1. Verify link existence and ownership
  const link = await linksDb.getLinkByShortCode(shortCode);
  if (!link || link.user_id !== userId) {
    return null;
  }

  // 2. Query total clicks in date range
  const totalSql =
    'SELECT COALESCE(SUM(click_count), 0)::BIGINT AS total_clicks ' +
    'FROM link_analytics_hourly ' +
    'WHERE short_code = $1 AND bucket_start >= $2 AND bucket_start <= $3';
  const totalRes = await query(totalSql, [shortCode, fromIso, toIso]);
  const totalClicks = Number(totalRes.rows[0].total_clicks);

  // 3. Query traffic time series grouped by hour or day
  const truncUnit = interval === 'hour' ? 'hour' : 'day';
  const seriesSql =
    `SELECT DATE_TRUNC($1, bucket_start) AS timestamp, SUM(click_count)::BIGINT AS clicks ` +
    'FROM link_analytics_hourly ' +
    'WHERE short_code = $2 AND bucket_start >= $3 AND bucket_start <= $4 ' +
    'GROUP BY 1 ORDER BY 1 ASC';
  const seriesRes = await query(seriesSql, [truncUnit, shortCode, fromIso, toIso]);
  const trafficSeries = seriesRes.rows.map((r) => ({
    timestamp: new Date(r.timestamp).toISOString(),
    clicks: Number(r.clicks),
  }));

  // 4. Query routing breakdown by route_type, route_key, destination_url
  const breakdownSql =
    'SELECT route_type, route_key, destination_url, SUM(click_count)::BIGINT AS clicks ' +
    'FROM link_analytics_hourly ' +
    'WHERE short_code = $1 AND bucket_start >= $2 AND bucket_start <= $3 ' +
    'GROUP BY route_type, route_key, destination_url ORDER BY clicks DESC';
  const breakdownRes = await query(breakdownSql, [shortCode, fromIso, toIso]);
  const routingBreakdown = breakdownRes.rows.map((r) => {
    const clicks = Number(r.clicks);
    const percentage = totalClicks > 0 ? Number(((clicks / totalClicks) * 100).toFixed(2)) : 0;
    return {
      route_type: r.route_type,
      route_key: r.route_key,
      destination_url: r.destination_url,
      clicks,
      percentage,
    };
  });

  return {
    short_code: shortCode,
    total_clicks: totalClicks,
    time_range: {
      from: fromIso,
      to: toIso,
      interval,
    },
    traffic_series: trafficSeries,
    routing_breakdown: routingBreakdown,
  };
}

/**
 * Retrieves overall developer analytics summary and top links leaderboard.
 *
 * @param {string} userId - UUID of authenticated owner
 * @param {string} fromIso - UTC ISO-8601 start timestamp
 * @param {string} toIso - UTC ISO-8601 end timestamp
 * @param {number} limit - Max top links to return
 * @returns {Promise<Object>} Analytics summary payload
 */
async function getAnalyticsSummary(userId, fromIso, toIso, limit = 10) {
  // 1. Current-state query: Active links count owned by developer
  const activeCountSql =
    'SELECT COUNT(*)::INT AS active_count ' +
    'FROM links ' +
    'WHERE user_id = $1 AND is_active = true';
  const activeRes = await query(activeCountSql, [userId]);
  const activeLinksCount = Number(activeRes.rows[0].active_count);

  // 2. Query total clicks across all developer's links in time window
  const totalSql =
    'SELECT COALESCE(SUM(a.click_count), 0)::BIGINT AS total_clicks ' +
    'FROM links l ' +
    'JOIN link_analytics_hourly a ON l.short_code = a.short_code ' +
    'WHERE l.user_id = $1 AND a.bucket_start >= $2 AND a.bucket_start <= $3';
  const totalRes = await query(totalSql, [userId, fromIso, toIso]);
  const totalClicks = Number(totalRes.rows[0].total_clicks);

  // 3. Query top links leaderboard ordered by traffic
  const topLinksSql =
    'SELECT l.short_code, l.target_url, COALESCE(SUM(a.click_count), 0)::BIGINT AS clicks ' +
    'FROM links l ' +
    'JOIN link_analytics_hourly a ON l.short_code = a.short_code ' +
    'WHERE l.user_id = $1 AND a.bucket_start >= $2 AND a.bucket_start <= $3 ' +
    'GROUP BY l.short_code, l.target_url ' +
    'ORDER BY clicks DESC ' +
    'LIMIT $4';
  const topRes = await query(topLinksSql, [userId, fromIso, toIso, limit]);
  const topLinks = topRes.rows.map((r) => ({
    short_code: r.short_code,
    target_url: r.target_url,
    clicks: Number(r.clicks),
  }));

  return {
    total_clicks: totalClicks,
    active_links_count: activeLinksCount,
    time_range: {
      from: fromIso,
      to: toIso,
    },
    top_links: topLinks,
  };
}

module.exports = {
  getUtcHourBucket,
  recordEvent,
  flushBuffer,
  startFlushTimer,
  stopFlushTimer,
  getBufferSnapshot,
  resetBufferForTesting,
  getLinkAnalytics,
  getAnalyticsSummary,
  MAX_BUFFER_ENTRIES,
};
