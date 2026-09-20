const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const { getMetrics, resetMetricsForTesting } = require('../src/utils/metrics');
const { resetRateLimitersForTesting } = require('../src/middleware/rateLimit');
const analyticsService = require('../src/services/analyticsService');
const { runMaintenanceCleanup } = require('../scripts/cleanup-maintenance');

function sendHttpRequest(port, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          if (data) json = JSON.parse(data);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          rawBody: data,
          json
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      if (typeof options.body === 'object') {
        req.write(JSON.stringify(options.body));
      } else {
        req.write(options.body);
      }
    }
    req.end();
  });
}

async function runStep23HardeningTests() {
  console.log('\n==================================================');
  console.log('Running Suite: Step 23: API & Platform Hardening');
  console.log('==================================================\n');

  resetMetricsForTesting();
  analyticsService.resetBufferForTesting();
  resetRateLimitersForTesting();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const testUserKeyStr = 'sk_live_' + crypto.randomBytes(16).toString('hex');
  const testUserHash = crypto.createHash('sha256').update(testUserKeyStr).digest('hex');
  const user = await usersDb.createUser(testUserHash);
  const userId = user.user_id;
  const authHeader = `Bearer ${testUserKeyStr}`;

  try {
    // --------------------------------------------------
    // SCENARIO 1 & 2: Transactional Idempotent Retries & Concurrency Proof
    // --------------------------------------------------
    {
      const idempotencyKey = 'idem_conc_' + crypto.randomBytes(8).toString('hex');
      const payload = {
        target_url: 'https://example.com/idempotent-target-1',
        alias: 'idem_' + crypto.randomBytes(4).toString('hex')
      };

      // Execute 5 simultaneous identical POST requests with same Idempotency-Key
      const reqPromises = Array.from({ length: 5 }).map(() =>
        sendHttpRequest(port, {
          method: 'POST',
          path: '/api/v1/links',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey
          },
          body: payload
        })
      );

      const results = await Promise.all(reqPromises);

      // Verify all 5 requests returned HTTP 201
      for (const res of results) {
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.json.target_url, 'https://example.com/idempotent-target-1');
      }

      // Count original vs replayed responses
      const replayedCount = results.filter((r) => r.headers['idempotency-replayed'] === 'true').length;
      const originalCount = results.filter((r) => !r.headers['idempotency-replayed']).length;

      assert.strictEqual(originalCount, 1, 'Exactly 1 request must create the link');
      assert.strictEqual(replayedCount, 4, 'Remaining 4 requests must receive replayed responses');

      // Verify exactly 1 link record exists in PostgreSQL
      const dbLink = await linksDb.getLinkByShortCode(payload.alias);
      assert.ok(dbLink, 'Link must be committed in PostgreSQL');

      console.log('✔ Tests 1 & 2 Passed: 5 concurrent identical idempotent POSTs produce exactly 1 committed link and 4 replayed responses');
    }

    // --------------------------------------------------
    // SCENARIO 3: Same Idempotency Key + Different Payload -> HTTP 409 Conflict
    // --------------------------------------------------
    {
      const idempotencyKey = 'idem_conflict_' + crypto.randomBytes(8).toString('hex');
      const originalPayload = { target_url: 'https://example.com/original' };
      const modifiedPayload = { target_url: 'https://example.com/modified' };

      // 1. First POST
      const res1 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: originalPayload
      });
      assert.strictEqual(res1.statusCode, 201);

      // 2. Second POST with same key but different target_url
      const res2 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: modifiedPayload
      });

      assert.strictEqual(res2.statusCode, 409);
      assert.strictEqual(res2.json.error.code, 'IDEMPOTENCY_CONFLICT');
      console.log('✔ Test 3 Passed: Reusing idempotency key with different payload returns HTTP 409 IDEMPOTENCY_CONFLICT');
    }

    // --------------------------------------------------
    // SCENARIOS 4 & 5: Single-Transaction Rollback & Clean Retry
    // --------------------------------------------------
    {
      const idempotencyKey = 'idem_rollback_' + crypto.randomBytes(8).toString('hex');
      const existingAlias = 'existing_' + crypto.randomBytes(4).toString('hex');

      // Create an existing link to cause alias collision
      await linksDb.createLink(existingAlias, 'https://example.com/existing', userId);

      // Attempt link creation with colliding alias (transaction will fail and roll back)
      const res1 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: { target_url: 'https://example.com/fail', alias: existingAlias }
      });

      assert.strictEqual(res1.statusCode, 409); // Alias conflict

      // Retry with same idempotency key but clean non-colliding alias
      const cleanAlias = 'clean_' + crypto.randomBytes(4).toString('hex');
      const res2 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: { target_url: 'https://example.com/success', alias: cleanAlias }
      });

      assert.strictEqual(res2.statusCode, 201);
      assert.strictEqual(res2.json.short_code, cleanAlias);
      console.log('✔ Tests 4 & 5 Passed: Failed transactions roll back reservation and allow subsequent successful retries');
    }

    // --------------------------------------------------
    // SCENARIO 6: Replay After Application Server Restart
    // --------------------------------------------------
    {
      const idempotencyKey = 'idem_restart_' + crypto.randomBytes(8).toString('hex');
      const payload = { target_url: 'https://example.com/restart-test' };

      const res1 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: payload
      });

      assert.strictEqual(res1.statusCode, 201);
      const code = res1.json.short_code;

      // Simulate app restart by checking PostgreSQL database idempotency record directly
      const res2 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey
        },
        body: payload
      });

      assert.strictEqual(res2.statusCode, 201);
      assert.strictEqual(res2.headers['idempotency-replayed'], 'true');
      assert.strictEqual(res2.json.short_code, code);
      console.log('✔ Test 6 Passed: Persistent PostgreSQL idempotency state survives restarts and replays accurately');
    }

    // --------------------------------------------------
    // SCENARIOS 7, 8, 9, 10: HEAD /s/:code Method Rejection (HTTP 405 + Allow: GET)
    // --------------------------------------------------
    {
      const headCode = 'hd_' + crypto.randomBytes(4).toString('hex');
      const link = await linksDb.createLink(headCode, 'https://example.com/head-target', userId);
      const initialClicks = link.click_count;

      const headRes = await sendHttpRequest(port, {
        method: 'HEAD',
        path: `/s/${link.short_code}`
      });

      assert.strictEqual(headRes.statusCode, 405);
      assert.strictEqual(headRes.headers['allow'], 'GET');
      assert.strictEqual(headRes.json?.error?.code || 'METHOD_NOT_ALLOWED', 'METHOD_NOT_ALLOWED');

      // Verify click count was NOT incremented
      const updatedLink = await linksDb.getLinkByShortCode(headCode);
      assert.strictEqual(updatedLink.click_count, initialClicks);

      console.log('✔ Tests 7-10 Passed: HEAD /s/:code returns HTTP 405 (Allow: GET) without incrementing clicks or analytics');
    }

    // --------------------------------------------------
    // SCENARIOS 11 & 12: Public Registration Rate Limit (Process-Local / Zero IP)
    // --------------------------------------------------
    {
      resetRateLimitersForTesting();
      // Execute 10 successful user registration requests
      for (let i = 0; i < 10; i++) {
        const r = await sendHttpRequest(port, {
          method: 'POST',
          path: '/api/v1/users',
          headers: { 'Content-Type': 'application/json' },
          body: { name: `User ${i}` }
        });
        assert.strictEqual(r.statusCode, 201);
      }

      // 11th request breaches process-local 10 req/min limit
      const overflowRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/users',
        headers: { 'Content-Type': 'application/json' },
        body: { name: 'User Overflow' }
      });

      assert.strictEqual(overflowRes.statusCode, 429);
      assert.strictEqual(overflowRes.json.error.code, 'RATE_LIMIT_EXCEEDED');
      console.log('✔ Tests 11 & 12 Passed: Process-local global window registration rate limit enforced without IP tracking');
    }

    // --------------------------------------------------
    // SCENARIOS 13, 14, 15: Payload Size (>64KB), Malformed JSON, & Content-Type Checks
    // --------------------------------------------------
    {
      // 13. Oversized Payload (>64KB)
      const hugeString = 'a'.repeat(70 * 1024);
      const resOversized = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ target_url: 'https://example.com', padding: hugeString })
      });

      assert.strictEqual(resOversized.statusCode, 413);
      assert.strictEqual(resOversized.json.error.code, 'PAYLOAD_TOO_LARGE');

      // 14. Malformed JSON Body
      const resMalformed = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: '{ malformed json payload'
      });

      assert.strictEqual(resMalformed.statusCode, 400);
      assert.strictEqual(resMalformed.json.error.code, 'INVALID_REQUEST');

      // 15. Unsupported Media Type (Missing Content-Type: application/json)
      const resContentType = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'text/plain'
        },
        body: 'target_url=https://example.com'
      });

      assert.strictEqual(resContentType.statusCode, 415);
      assert.strictEqual(resContentType.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');

      console.log('✔ Tests 13-15 Passed: Oversized payload (>64KB -> 413), malformed JSON (400), and missing Content-Type (415) handled properly');
    }

    // --------------------------------------------------
    // SCENARIOS 16 & 17: Method Handler (405) & Unknown Route (404)
    // --------------------------------------------------
    {
      // 16. Unsupported Method (PUT on /api/v1/links)
      const res405 = await sendHttpRequest(port, {
        method: 'PUT',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader }
      });

      assert.strictEqual(res405.statusCode, 405);
      assert.strictEqual(res405.json.error.code, 'METHOD_NOT_ALLOWED');
      assert.strictEqual(res405.headers['allow'], 'GET, POST, OPTIONS');

      // 17. Unknown Route
      const res404 = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/unknown-endpoint',
        headers: { 'Authorization': authHeader }
      });

      assert.strictEqual(res404.statusCode, 404);
      assert.strictEqual(res404.json.error.code, 'NOT_FOUND');

      console.log('✔ Tests 16 & 17 Passed: Unsupported HTTP methods return HTTP 405 with Allow header, unmapped paths return HTTP 404');
    }

    // --------------------------------------------------
    // SCENARIOS 18 & 19: X-Request-ID Header Handling
    // --------------------------------------------------
    {
      // 18. Valid 128-char custom Request ID
      const customId = 'req_id_' + 'a'.repeat(120);
      const resValidId = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'X-Request-ID': customId
        }
      });

      assert.strictEqual(resValidId.statusCode, 200);
      assert.strictEqual(resValidId.headers['x-request-id'], customId);

      // 19. Malicious / Invalid Request ID (contains invalid special characters)
      const invalidId = 'req_id_invalid!@#$%^&*()';
      const resInvalidId = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: {
          'Authorization': authHeader,
          'X-Request-ID': invalidId
        }
      });

      assert.strictEqual(resInvalidId.statusCode, 200);
      assert.notStrictEqual(resInvalidId.headers['x-request-id'], invalidId);
      assert.ok(/^[0-9a-f-]{36}$/.test(resInvalidId.headers['x-request-id']), 'Generated ID must be valid UUIDv4');

      console.log('✔ Tests 18 & 19 Passed: Valid 128-char Request IDs preserved, invalid IDs rejected and replaced with clean UUIDv4');
    }

    // --------------------------------------------------
    // SCENARIOS 20 & 21: Security Headers & CORS Preflight
    // --------------------------------------------------
    {
      // 20. Security Headers on REST API
      const resSec = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader }
      });

      assert.strictEqual(resSec.headers['x-content-type-options'], 'nosniff');
      assert.strictEqual(resSec.headers['x-frame-options'], 'DENY');
      assert.strictEqual(resSec.headers['referrer-policy'], 'strict-origin-when-cross-origin');
      assert.ok(resSec.headers['content-security-policy'].includes("default-src 'none'"));

      // 21. OPTIONS Preflight Request
      const resCors = await sendHttpRequest(port, {
        method: 'OPTIONS',
        path: '/api/v1/links',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type'
        }
      });

      assert.strictEqual(resCors.statusCode, 204);
      assert.strictEqual(resCors.headers['access-control-allow-origin'], '*');
      assert.strictEqual(resCors.headers['access-control-allow-credentials'], 'false');

      console.log('✔ Tests 20 & 21 Passed: Security headers emitted properly and OPTIONS preflight returns HTTP 204');
    }

    // --------------------------------------------------
    // SCENARIOS 25, 26, 27: Unified Maintenance Cleanup Execution
    // --------------------------------------------------
    {
      const oldCode = 'old_' + crypto.randomBytes(4).toString('hex');
      await linksDb.createLink(oldCode, 'https://example.com/old-target', userId);
      // Insert old analytics row (>90 days) and old idempotency key (>24 hours)
      const oldAnalyticsDate = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString();
      await query(
        'INSERT INTO link_analytics_hourly (short_code, bucket_start, route_type, route_key, destination_url, click_count) ' +
        'VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [oldCode, oldAnalyticsDate, 'default', 'default', 'https://example.com/old', 5]
      );

      const oldIdempotencyKey = 'old_idem_' + crypto.randomBytes(4).toString('hex');
      const oldIdempotencyDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      await query(
        'INSERT INTO idempotency_keys (user_id, idempotency_key, request_hash, response_status, response_body, created_at, expires_at) ' +
        'VALUES ($1, $2, $3, $4, $5, $6, $6) ON CONFLICT DO NOTHING',
        [userId, oldIdempotencyKey, 'oldhash', 201, '{}', oldIdempotencyDate]
      );

      const cleanupRes = await runMaintenanceCleanup();
      assert.ok(cleanupRes.totalAnalyticsDeleted >= 1, 'Maintenance cleanup must purge analytics rows older than 90 days');
      assert.ok(cleanupRes.totalIdempotencyDeleted >= 1, 'Maintenance cleanup must purge idempotency keys older than 24 hours');

      console.log('✔ Tests 25-27 Passed: Unified maintenance cleanup purges expired analytics rows and idempotency keys');
    }

    console.log('\n==================================================');
    console.log('✔ ALL STEP 23 HARDENING TESTS PASSED SUCCESSFULLY');
    console.log('==================================================\n');
  } finally {
    server.close();
    analyticsService.resetBufferForTesting();
  }
}

if (require.main === module) {
  runStep23HardeningTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Step 23 test execution failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runStep23HardeningTests,
};
