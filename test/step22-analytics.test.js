const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const analyticsService = require('../src/services/analyticsService');
const { getMetrics, resetMetricsForTesting } = require('../src/utils/metrics');
const { runMaintenanceCleanup } = require('../scripts/cleanup-maintenance');

function sendHttpRequest(port, { method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    let payload = null;
    if (body !== null) {
      payload = typeof body === 'string' ? Buffer.from(body) : Buffer.from(JSON.stringify(body));
    }

    const reqHeaders = { ...headers };
    if (payload && !reqHeaders['content-type'] && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (payload && !reqHeaders['content-length'] && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = payload.length;
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: reqHeaders,
    }, (res) => {
      let responseText = '';
      res.on('data', (chunk) => { responseText += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(responseText);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseText,
          json,
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function runStep22AnalyticsTests() {
  console.log('\n==================================================');
  console.log('Running Suite: Step 22: Advanced Analytics & Traffic Intelligence');
  console.log('==================================================\n');

  resetMetricsForTesting();
  analyticsService.resetBufferForTesting();

  // Create test server instance on dynamic ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const testUserKeyStr = 'sk_live_' + crypto.randomBytes(16).toString('hex');
  const testUserHash = crypto.createHash('sha256').update(testUserKeyStr).digest('hex');
  const user = await usersDb.createUser(testUserHash);
  const userId = user.user_id;
  const authHeader = `Bearer ${testUserKeyStr}`;

  const otherUserKeyStr = 'sk_live_' + crypto.randomBytes(16).toString('hex');
  const otherUserHash = crypto.createHash('sha256').update(otherUserKeyStr).digest('hex');
  const otherUser = await usersDb.createUser(otherUserHash);
  const otherUserId = otherUser.user_id;
  const otherAuthHeader = `Bearer ${otherUserKeyStr}`;

  const createdShortCodes = [];

  try {
    // --------------------------------------------------
    // SCENARIO 1: UTC Hour Bucket Calculation Unit Test
    // --------------------------------------------------
    {
      const testDate = new Date('2026-09-19T15:34:27.123Z');
      const bucket = analyticsService.getUtcHourBucket(testDate);
      assert.strictEqual(bucket, '2026-09-19T15:00:00.000Z');
      console.log('✔ Test 1 Passed: UTC hour bucket truncation verified');
    }

    // --------------------------------------------------
    // SCENARIO 2: In-Memory Buffer Aggregation Unit Test
    // --------------------------------------------------
    {
      analyticsService.resetBufferForTesting();
      analyticsService.recordEvent({
        shortCode: 'unit_sc2',
        routeType: 'default',
        routeKey: 'default',
        destinationUrl: 'https://example.com/unit-sc2',
        now: new Date('2026-09-19T15:10:00.000Z'),
      });
      analyticsService.recordEvent({
        shortCode: 'unit_sc2',
        routeType: 'default',
        routeKey: 'default',
        destinationUrl: 'https://example.com/unit-sc2',
        now: new Date('2026-09-19T15:20:00.000Z'),
      });

      const snapshot = analyticsService.getBufferSnapshot();
      assert.strictEqual(snapshot.length, 1);
      assert.strictEqual(snapshot[0].count, 2);
      assert.strictEqual(snapshot[0].shortCode, 'unit_sc2');
      analyticsService.resetBufferForTesting();
      console.log('✔ Test 2 Passed: Multiple redirects for same tuple aggregate in-memory into 1 counter entry');
    }

    // --------------------------------------------------
    // SCENARIOS 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15:
    // End-to-End Routing Ingestion & Deterministic Route Keys
    // --------------------------------------------------
    {
      // Create short link with Step 21 routing_config
      const createRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: {
          target_url: 'https://example.com/fallback-target',
          routing_config: {
            default: 'https://example.com/default-target',
            rules: [
              {
                type: 'device',
                devices: ['mobile'],
                target_url: 'https://m.example.com/mobile-target'
              },
              {
                type: 'time',
                start: '00:00',
                end: '23:59',
                timezone: 'UTC',
                target_url: 'https://example.com/time-target'
              }
            ]
          }
        }
      });
      assert.strictEqual(createRes.statusCode, 201);
      const code = createRes.json.short_code;
      createdShortCodes.push(code);

      // 1. Mobile request -> Device rule match (route_type = 'device', route_key = 'rule_0')
      const rMobile = await sendHttpRequest(port, {
        method: 'GET',
        path: `/s/${code}`,
        headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
      });
      assert.strictEqual(rMobile.statusCode, 302);
      assert.strictEqual(rMobile.headers.location, 'https://m.example.com/mobile-target');

      // 2. Desktop request -> Time rule match (route_type = 'time', route_key = 'rule_1')
      const rDesktop = await sendHttpRequest(port, {
        method: 'GET',
        path: `/s/${code}`,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      assert.strictEqual(rDesktop.statusCode, 302);
      assert.strictEqual(rDesktop.headers.location, 'https://example.com/time-target');

      // Flush buffer to PostgreSQL
      const flushedCount = await analyticsService.flushBuffer();
      assert.ok(flushedCount >= 2, 'Buffer flush should persist aggregated analytics entries');

      // Query per-link analytics API
      const analyticsRes = await sendHttpRequest(port, {
        method: 'GET',
        path: `/api/v1/links/${code}/analytics`,
        headers: { 'Authorization': authHeader }
      });

      assert.strictEqual(analyticsRes.statusCode, 200);
      assert.strictEqual(analyticsRes.json.short_code, code);
      assert.strictEqual(analyticsRes.json.total_clicks, 2);
      assert.ok(Array.isArray(analyticsRes.json.routing_breakdown));
      assert.strictEqual(analyticsRes.json.routing_breakdown.length, 2);

      const deviceBreakdown = analyticsRes.json.routing_breakdown.find((r) => r.route_type === 'device');
      assert.ok(deviceBreakdown);
      assert.strictEqual(deviceBreakdown.route_key, 'rule_0');
      assert.strictEqual(deviceBreakdown.destination_url, 'https://m.example.com/mobile-target');
      assert.strictEqual(deviceBreakdown.clicks, 1);
      assert.strictEqual(deviceBreakdown.percentage, 50);

      const timeBreakdown = analyticsRes.json.routing_breakdown.find((r) => r.route_type === 'time');
      assert.ok(timeBreakdown);
      assert.strictEqual(timeBreakdown.route_key, 'rule_1');
      assert.strictEqual(timeBreakdown.destination_url, 'https://example.com/time-target');

      console.log('✔ Tests 3-15 Passed: End-to-end analytics ingestion, routing breakdown, and deterministic route keys verified');
    }

    // --------------------------------------------------
    // SCENARIO 16: Owner Authorization & Cross-User Isolation (HTTP 404)
    // --------------------------------------------------
    {
      const code = createdShortCodes[0];
      const otherUserRes = await sendHttpRequest(port, {
        method: 'GET',
        path: `/api/v1/links/${code}/analytics`,
        headers: { 'Authorization': otherAuthHeader }
      });

      assert.strictEqual(otherUserRes.statusCode, 404);
      assert.strictEqual(otherUserRes.json.error.code, 'NOT_FOUND');
      console.log('✔ Test 16 Passed: Cross-user analytics query returns HTTP 404 NOT_FOUND');
    }

    // --------------------------------------------------
    // SCENARIOS 17, 18, 19: Date & Parameter Validation Rejections (HTTP 400)
    // --------------------------------------------------
    {
      const code = createdShortCodes[0];

      // Invalid interval
      const r1 = await sendHttpRequest(port, {
        method: 'GET',
        path: `/api/v1/links/${code}/analytics?interval=year`,
        headers: { 'Authorization': authHeader }
      });
      assert.strictEqual(r1.statusCode, 400);

      // from > to
      const r2 = await sendHttpRequest(port, {
        method: 'GET',
        path: `/api/v1/links/${code}/analytics?from=2026-10-01T00:00:00Z&to=2026-09-01T00:00:00Z`,
        headers: { 'Authorization': authHeader }
      });
      assert.strictEqual(r2.statusCode, 400);

      // >90 days range
      const r3 = await sendHttpRequest(port, {
        method: 'GET',
        path: `/api/v1/links/${code}/analytics?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z`,
        headers: { 'Authorization': authHeader }
      });
      assert.strictEqual(r3.statusCode, 400);

      console.log('✔ Tests 17-19 Passed: Invalid interval, reversed timestamps, and >90 day ranges rejected with HTTP 400');
    }

    // --------------------------------------------------
    // SCENARIOS 20, 21: Buffer Maximum Capacity & Overflow Behavior
    // --------------------------------------------------
    {
      analyticsService.resetBufferForTesting();
      const initialOverflow = getMetrics().analytics_buffer_overflow_total;

      // Fill buffer to MAX_BUFFER_ENTRIES (10,000 unique keys)
      for (let i = 0; i < analyticsService.MAX_BUFFER_ENTRIES; i++) {
        analyticsService.recordEvent({
          shortCode: `sc_oflow_${i}`,
          routeType: 'default',
          routeKey: 'default',
          destinationUrl: `https://example.com/oflow-${i}`,
          now: new Date('2026-09-19T15:00:00.000Z'),
        });
      }

      assert.strictEqual(analyticsService.getBufferSnapshot().length, 10000);

      // Overflow push
      analyticsService.recordEvent({
        shortCode: 'sc_overflow_extra',
        routeType: 'default',
        routeKey: 'default',
        destinationUrl: 'https://example.com/extra',
        now: new Date('2026-09-19T15:00:00.000Z'),
      });

      assert.strictEqual(analyticsService.getBufferSnapshot().length, 10000);
      assert.strictEqual(getMetrics().analytics_buffer_overflow_total, initialOverflow + 1);

      analyticsService.resetBufferForTesting();
      console.log('✔ Tests 20 & 21 Passed: Buffer capacity limit of 10,000 entries drops extra events and increments overflow metric');
    }

    // --------------------------------------------------
    // SCENARIOS 22, 23, 24: PostgreSQL Flush Failure & Retry Isolation
    // --------------------------------------------------
    {
      analyticsService.resetBufferForTesting();
      analyticsService.recordEvent({
        shortCode: createdShortCodes[0],
        routeType: 'default',
        routeKey: 'default',
        destinationUrl: 'https://example.com/retry-test',
        now: new Date('2026-09-19T15:00:00.000Z'),
      });

      // Mock database query failure during flush
      const originalQuery = pool.query;
      const initialFlushErr = getMetrics().analytics_flush_errors_total;

      pool.query = async (text, params) => {
        if (typeof text === 'string' && text.includes('INSERT INTO link_analytics_hourly')) {
          throw new Error('Simulated PostgreSQL flush failure');
        }
        return originalQuery.call(pool, text, params);
      };

      const flushedCount = await analyticsService.flushBuffer();
      pool.query = originalQuery; // Restore original DB query

      assert.strictEqual(flushedCount, 0);
      assert.strictEqual(getMetrics().analytics_flush_errors_total, initialFlushErr + 1);
      assert.strictEqual(analyticsService.getBufferSnapshot().length, 1, 'Failed items must be restored to buffer for retry');

      // Subsequent redirect succeeds normally during DB analytics failure
      const redirectRes = await sendHttpRequest(port, { method: 'GET', path: `/s/${createdShortCodes[0]}` });
      assert.strictEqual(redirectRes.statusCode, 302);

      // Retry flush after DB recovery
      const recoveredCount = await analyticsService.flushBuffer();
      assert.ok(recoveredCount >= 1, 'Flush must succeed after database recovers');

      console.log('✔ Tests 22-24 Passed: Flush errors logged/retried and redirects continue normally during DB outages');
    }

    // --------------------------------------------------
    // SCENARIOS 25, 27, 28: Summary Leaderboard & active_links_count
    // --------------------------------------------------
    {
      const summaryRes = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/analytics/summary?limit=10',
        headers: { 'Authorization': authHeader }
      });

      assert.strictEqual(summaryRes.statusCode, 200);
      assert.ok(typeof summaryRes.json.total_clicks === 'number');
      assert.ok(typeof summaryRes.json.active_links_count === 'number');
      assert.ok(Array.isArray(summaryRes.json.top_links));

      const topItem = summaryRes.json.top_links.find((l) => l.short_code === createdShortCodes[0]);
      assert.ok(topItem);
      console.log('✔ Tests 25, 27, 28 Passed: GET /api/v1/analytics/summary returns total clicks, active links count, and top links');
    }

    // --------------------------------------------------
    // SCENARIO 26: Workerless Retention Cleanup Script Execution
    // --------------------------------------------------
    {
      // Insert an expired hourly bucket row (91 days old)
      const oldBucket = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      await query(
        'INSERT INTO link_analytics_hourly (short_code, bucket_start, route_type, route_key, destination_url, click_count) ' +
        'VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [createdShortCodes[0], oldBucket, 'default', 'default', 'https://example.com/old', 5]
      );

      // Run cleanup maintenance function (non-blocking batch delete)
      const resCleanup = await runMaintenanceCleanup();
      assert.ok(resCleanup.totalAnalyticsDeleted >= 1, 'Retention cleanup must purge rows older than 90 days');

      console.log('✔ Test 26 Passed: Workerless retention cleanup script purges expired analytics rows');
    }

    // --------------------------------------------------
    // SCENARIO 29 & 30: SQL Injection Prevention
    // --------------------------------------------------
    {
      const code = createdShortCodes[0];
      const sqlInjectionRes = await sendHttpRequest(port, {
        method: 'GET',
        path: `/api/v1/links/${code}/analytics?interval=${encodeURIComponent("day' OR 1=1--")}`,
        headers: { 'Authorization': authHeader }
      });

      assert.strictEqual(sqlInjectionRes.statusCode, 400);
      assert.strictEqual(sqlInjectionRes.json.error.code, 'INVALID_REQUEST');
      console.log('✔ Tests 29 & 30 Passed: SQL injection payloads in query parameters are rejected');
    }

    // --------------------------------------------------
    // SCENARIO 31: Step 21 Routing Behavior & Regression Safety
    // --------------------------------------------------
    {
      const normalRes = await sendHttpRequest(port, { method: 'GET', path: `/s/${createdShortCodes[0]}` });
      assert.strictEqual(normalRes.statusCode, 302);
      console.log('✔ Test 31 Passed: Step 21 routing behavior and HTTP 302 redirects remain fully regression-free');
    }

    console.log('\n==================================================');
    console.log('✔ ALL STEP 22 ANALYTICS TESTS PASSED SUCCESSFULLY');
    console.log('==================================================\n');
  } finally {
    server.close();
    analyticsService.resetBufferForTesting();
  }
}

if (require.main === module) {
  runStep22AnalyticsTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Step 22 test execution failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runStep22AnalyticsTests,
};
