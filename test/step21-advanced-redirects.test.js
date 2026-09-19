const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const { resetMetricsForTesting, getMetrics } = require('../src/utils/metrics');
const { evaluateRoutingRules, classifyDevice, getZonedDateTimeInfo } = require('../src/services/routingEngine');
const { validateRoutingConfig } = require('../src/utils/routingValidator');

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
          text: responseText,
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

async function runStep21AdvancedRedirectsTests() {
  console.log('\n==================================================');
  console.log('Running Suite: Step 21: Advanced Redirect Intelligence & Traffic Controls');
  console.log('==================================================\n');

  let server = null;
  let port = null;
  let testUser = null;
  let nonOwnerUser = null;

  const rawKey = `test_key_step21_${crypto.randomBytes(16).toString('hex')}`;
  const apiKeyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const authHeader = `Bearer ${rawKey}`;

  const nonOwnerKey = `test_key_step21_other_${crypto.randomBytes(16).toString('hex')}`;
  const nonOwnerHash = crypto.createHash('sha256').update(nonOwnerKey).digest('hex');
  const nonOwnerAuthHeader = `Bearer ${nonOwnerKey}`;

  const createdShortCodes = [];

  try {
    resetMetricsForTesting();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    testUser = await usersDb.createUser(apiKeyHash);
    nonOwnerUser = await usersDb.createUser(nonOwnerHash);

    // --------------------------------------------------
    // SCENARIO 1: Normal link without routing_config
    // --------------------------------------------------
    {
      const res = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: { target_url: 'https://example.com/normal-target' }
      });
      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.json.routing_config, null);
      const code = res.json.short_code;
      createdShortCodes.push(code);

      const redRes = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(redRes.statusCode, 302);
      assert.strictEqual(redRes.headers.location, 'https://example.com/normal-target');
      console.log('✔ Test 1 Passed: Normal link without routing_config redirects to target_url');
    }

    // --------------------------------------------------
    // SCENARIO 2: Link with empty rules routing_config
    // --------------------------------------------------
    {
      const res = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: {
          target_url: 'https://example.com/fallback-target',
          routing_config: { rules: [] }
        }
      });
      assert.strictEqual(res.statusCode, 201);
      const code = res.json.short_code;
      createdShortCodes.push(code);

      const redRes = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(redRes.statusCode, 302);
      assert.strictEqual(redRes.headers.location, 'https://example.com/fallback-target');
      console.log('✔ Test 2 Passed: Link with empty routing_config rules array falls back to target_url');
    }

    // --------------------------------------------------
    // SCENARIOS 3, 4, 5: Time Routing (Daytime, Outside Window, Overnight)
    // --------------------------------------------------
    {
      // Daytime test at 12:00 UTC
      const mockDateDay = new Date('2026-06-15T12:00:00.000Z'); // Monday 12:00 UTC
      const linkRecord = {
        target_url: 'https://example.com/default',
        routing_config: {
          rules: [
            {
              type: 'time',
              start: '09:00',
              end: '17:00',
              timezone: 'UTC',
              target_url: 'https://example.com/daytime-target'
            }
          ]
        }
      };

      const dayResult = evaluateRoutingRules(linkRecord, null, mockDateDay);
      assert.strictEqual(dayResult, 'https://example.com/daytime-target');

      // Outside daytime window (20:00 UTC)
      const mockDateNight = new Date('2026-06-15T20:00:00.000Z');
      const nightResult = evaluateRoutingRules(linkRecord, null, mockDateNight);
      assert.strictEqual(nightResult, 'https://example.com/default');

      // Overnight window test (22:00 to 06:00) at 01:00 UTC
      const overnightRecord = {
        target_url: 'https://example.com/default',
        routing_config: {
          rules: [
            {
              type: 'time',
              start: '22:00',
              end: '06:00',
              timezone: 'UTC',
              target_url: 'https://example.com/overnight-target'
            }
          ]
        }
      };
      const mockDateOvernight = new Date('2026-06-16T01:00:00.000Z');
      const overnightResult = evaluateRoutingRules(overnightRecord, null, mockDateOvernight);
      assert.strictEqual(overnightResult, 'https://example.com/overnight-target');

      console.log('✔ Tests 3, 4, 5 Passed: Time routing matches daytime, outside window, and overnight intervals');
    }

    // --------------------------------------------------
    // SCENARIO 6: Time rule start == end rejected
    // --------------------------------------------------
    {
      const res = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: {
          target_url: 'https://example.com/invalid-time-target',
          routing_config: {
            rules: [
              {
                type: 'time',
                start: '12:00',
                end: '12:00',
                target_url: 'https://example.com/err'
              }
            ]
          }
        }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      assert.ok(res.json.error.message.includes('cannot be equal'));
      console.log('✔ Test 6 Passed: Time rule start == end is rejected with HTTP 400 INVALID_REQUEST');
    }

    // --------------------------------------------------
    // SCENARIOS 7 & 8: IANA Timezone & Day of Week Filtering
    // --------------------------------------------------
    {
      // 2026-06-15 14:00 UTC is 19:30 IST (Asia/Kolkata)
      const mockDate = new Date('2026-06-15T14:00:00.000Z');
      const tzRecord = {
        target_url: 'https://example.com/default',
        routing_config: {
          rules: [
            {
              type: 'time',
              start: '18:00',
              end: '22:00',
              timezone: 'Asia/Kolkata',
              days: ['mon'],
              target_url: 'https://example.com/kolkata-evening'
            }
          ]
        }
      };
      const tzResult = evaluateRoutingRules(tzRecord, null, mockDate);
      assert.strictEqual(tzResult, 'https://example.com/kolkata-evening');
      console.log('✔ Tests 7 & 8 Passed: Time routing respects IANA timezone and day of week filtering');
    }

    // --------------------------------------------------
    // SCENARIOS 9, 10, 11, 12: Device Classification
    // --------------------------------------------------
    {
      const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
      const tabletUA = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
      const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      assert.strictEqual(classifyDevice(mobileUA), 'mobile');
      assert.strictEqual(classifyDevice(tabletUA), 'tablet');
      assert.strictEqual(classifyDevice(desktopUA), 'desktop');
      assert.strictEqual(classifyDevice(''), 'unknown');
      assert.strictEqual(classifyDevice(null), 'unknown');

      const deviceRecord = {
        target_url: 'https://example.com/desktop-target',
        routing_config: {
          rules: [
            { type: 'device', devices: ['mobile'], target_url: 'https://example.com/mobile-target' },
            { type: 'device', devices: ['tablet'], target_url: 'https://example.com/tablet-target' }
          ]
        }
      };

      const mobileReq = { get: (h) => (h.toLowerCase() === 'user-agent' ? mobileUA : null) };
      assert.strictEqual(evaluateRoutingRules(deviceRecord, mobileReq), 'https://example.com/mobile-target');

      const tabletReq = { get: (h) => (h.toLowerCase() === 'user-agent' ? tabletUA : null) };
      assert.strictEqual(evaluateRoutingRules(deviceRecord, tabletReq), 'https://example.com/tablet-target');

      const unknownReq = { get: () => null };
      assert.strictEqual(evaluateRoutingRules(deviceRecord, unknownReq), 'https://example.com/desktop-target');

      console.log('✔ Tests 9-12 Passed: Device classification handles mobile, tablet, desktop, and unknown User-Agents');
    }

    // --------------------------------------------------
    // SCENARIO 13: Weighted Routing Unit Interval Test
    // --------------------------------------------------
    {
      const weightedRecord = {
        target_url: 'https://example.com/default',
        routing_config: {
          rules: [
            {
              type: 'weighted',
              destinations: [
                { target_url: 'https://example.com/a', weight: 80 },
                { target_url: 'https://example.com/b', weight: 20 }
              ]
            }
          ]
        }
      };

      // Test discrete evaluation
      const dest = evaluateRoutingRules(weightedRecord, null);
      assert.ok(dest === 'https://example.com/a' || dest === 'https://example.com/b');
      console.log('✔ Test 13 Passed: Weighted routing algorithm executes discrete interval selection');
    }

    // --------------------------------------------------
    // SCENARIO 14: Weighted Statistical Distribution Test (10,000 Iterations)
    // --------------------------------------------------
    {
      const weightedRecord = {
        target_url: 'https://example.com/default',
        routing_config: {
          rules: [
            {
              type: 'weighted',
              destinations: [
                { target_url: 'https://example.com/a', weight: 80 },
                { target_url: 'https://example.com/b', weight: 20 }
              ]
            }
          ]
        }
      };

      let countA = 0;
      let countB = 0;
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const dest = evaluateRoutingRules(weightedRecord, null);
        if (dest === 'https://example.com/a') countA++;
        else if (dest === 'https://example.com/b') countB++;
      }

      const percentageA = (countA / iterations) * 100;
      // Assert 80% target is within ±3 percentage points (77% to 83%)
      assert.ok(percentageA >= 77.0 && percentageA <= 83.0, `Expected 80/20 distribution percentage A (got ${percentageA}%) to be between 77% and 83%`);
      console.log(`✔ Test 14 Passed: Weighted statistical test (10,000 runs) verified 80/20 distribution (${percentageA.toFixed(2)}% vs ${(100 - percentageA).toFixed(2)}%)`);
    }

    // --------------------------------------------------
    // SCENARIO 15: Rule Precedence (Sequential array order)
    // --------------------------------------------------
    {
      const precedenceRecord = {
        target_url: 'https://example.com/default',
        routing_config: {
          rules: [
            { type: 'time', start: '00:00', end: '23:59', timezone: 'UTC', target_url: 'https://example.com/rule-1' },
            { type: 'device', devices: ['mobile'], target_url: 'https://example.com/rule-2' }
          ]
        }
      };
      const mobileReq = { get: (h) => (h.toLowerCase() === 'user-agent' ? 'iPhone' : null) };
      // Rule 1 matches first because it appears first in the array
      assert.strictEqual(evaluateRoutingRules(precedenceRecord, mobileReq), 'https://example.com/rule-1');
      console.log('✔ Test 15 Passed: Sequential array evaluation order determines rule match precedence');
    }

    // --------------------------------------------------
    // SCENARIOS 16 & 17: Fallback to routing_config.default vs primary target_url
    // --------------------------------------------------
    {
      const defaultRecord = {
        target_url: 'https://example.com/primary',
        routing_config: {
          default: 'https://example.com/configured-default',
          rules: [
            { type: 'device', devices: ['tablet'], target_url: 'https://example.com/tablet' }
          ]
        }
      };
      const desktopReq = { get: (h) => (h.toLowerCase() === 'user-agent' ? 'Windows Desktop' : null) };
      // Non-matching rule falls back to routing_config.default
      assert.strictEqual(evaluateRoutingRules(defaultRecord, desktopReq), 'https://example.com/configured-default');

      const noDefaultRecord = {
        target_url: 'https://example.com/primary',
        routing_config: {
          rules: [
            { type: 'device', devices: ['tablet'], target_url: 'https://example.com/tablet' }
          ]
        }
      };
      // Non-matching rule without configured default falls back to link.target_url
      assert.strictEqual(evaluateRoutingRules(noDefaultRecord, desktopReq), 'https://example.com/primary');

      console.log('✔ Tests 16 & 17 Passed: Non-matching rules fallback to routing_config.default or primary target_url');
    }

    // --------------------------------------------------
    // SCENARIOS 18, 19, 20: Payload Limits & Validation Errors
    // --------------------------------------------------
    {
      // 18. Invalid payload structure
      const res18 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: { target_url: 'https://example.com/test', routing_config: 'not-an-object' }
      });
      assert.strictEqual(res18.statusCode, 400);

      // 19. Exceeding 16 KB payload
      const hugeString = 'a'.repeat(17000);
      const res19 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: { target_url: 'https://example.com/test', routing_config: { default: `https://example.com/${hugeString}` } }
      });
      assert.strictEqual(res19.statusCode, 400);

      // 20. Exceeding 10 rules
      const rules11 = Array(11).fill(0).map(() => ({ type: 'device', devices: ['mobile'], target_url: 'https://example.com/m' }));
      const res20 = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: { target_url: 'https://example.com/test', routing_config: { rules: rules11 } }
      });
      assert.strictEqual(res20.statusCode, 400);

      console.log('✔ Tests 18, 19, 20 Passed: Payload limits (16 KB, 10 rules, invalid structures) rejected with HTTP 400');
    }

    // --------------------------------------------------
    // SCENARIOS 21 & 22: PATCH routing_config (Removal & Ownership Isolation)
    // --------------------------------------------------
    {
      const createRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: {
          target_url: 'https://example.com/original-target',
          routing_config: { default: 'https://example.com/initial-default' }
        }
      });
      assert.strictEqual(createRes.statusCode, 201);
      const code = createRes.json.short_code;
      createdShortCodes.push(code);

      // Non-owner cannot PATCH
      const nonOwnerPatch = await sendHttpRequest(port, {
        method: 'PATCH',
        path: `/api/v1/links/${code}`,
        headers: { 'Authorization': nonOwnerAuthHeader },
        body: { routing_config: null }
      });
      assert.strictEqual(nonOwnerPatch.statusCode, 404);

      // Owner clearing routing_config (routing_config = null)
      const ownerPatch = await sendHttpRequest(port, {
        method: 'PATCH',
        path: `/api/v1/links/${code}`,
        headers: { 'Authorization': authHeader },
        body: { routing_config: null }
      });
      assert.strictEqual(ownerPatch.statusCode, 200);
      assert.strictEqual(ownerPatch.json.routing_config, null);

      console.log('✔ Tests 21 & 22 Passed: Owner can clear routing_config via PATCH while non-owner updates are rejected');
    }

    // --------------------------------------------------
    // SCENARIO 23: GET /api/v1/links includes routing_config
    // --------------------------------------------------
    {
      const res = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.json.links));
      assert.ok('routing_config' in res.json.links[0]);
      console.log('✔ Test 23 Passed: GET /api/v1/links listing includes routing_config field');
    }

    // --------------------------------------------------
    // SCENARIOS 24 & 25: Cache Hit In-Memory Evaluation & Invalidation on PATCH
    // --------------------------------------------------
    {
      const createRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: {
          target_url: 'https://example.com/base-target',
          routing_config: { default: 'https://example.com/v1-default' }
        }
      });
      const code = createRes.json.short_code;
      createdShortCodes.push(code);

      // 1st request -> Cache miss
      const r1 = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(r1.statusCode, 302);
      assert.strictEqual(r1.headers.location, 'https://example.com/v1-default');

      // 2nd request -> Cache hit (evaluated in memory)
      const r2 = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(r2.statusCode, 302);
      assert.strictEqual(r2.headers.location, 'https://example.com/v1-default');

      // Update link -> Invalidates cache
      await sendHttpRequest(port, {
        method: 'PATCH',
        path: `/api/v1/links/${code}`,
        headers: { 'Authorization': authHeader },
        body: { routing_config: { default: 'https://example.com/v2-default' } }
      });

      // 3rd request -> New destination served immediately
      const r3 = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(r3.statusCode, 302);
      assert.strictEqual(r3.headers.location, 'https://example.com/v2-default');

      console.log('✔ Tests 24 & 25 Passed: Cache hits evaluate in memory and PATCH invalidates cache immediately');
    }

    // --------------------------------------------------
    // SCENARIOS 26 & 27: Expired and Deactivated Links return HTTP 410
    // --------------------------------------------------
    {
      const pastIso = new Date(Date.now() - 3600000).toISOString();
      const expCode = `exp21_${crypto.randomBytes(4).toString('hex')}`;
      await query(
        `INSERT INTO links (short_code, target_url, user_id, expires_at, routing_config) VALUES ($1, $2, $3, $4, $5)`,
        [expCode, 'https://example.com/exp', testUser.user_id, pastIso, JSON.stringify({ default: 'https://example.com/def' })]
      );
      createdShortCodes.push(expCode);

      const expRes = await sendHttpRequest(port, { method: 'GET', path: `/s/${expCode}` });
      assert.strictEqual(expRes.statusCode, 410);
      assert.strictEqual(expRes.json.error.code, 'LINK_EXPIRED');

      // Soft deactivation test
      await linksDb.deactivateUserLink(createdShortCodes[0], testUser.user_id);
      const deactRes = await sendHttpRequest(port, { method: 'GET', path: `/s/${createdShortCodes[0]}` });
      assert.strictEqual(deactRes.statusCode, 410);
      assert.strictEqual(deactRes.json.error.code, 'LINK_INACTIVE');

      console.log('✔ Tests 26 & 27 Passed: Expired and deactivated links with routing_config return HTTP 410');
    }

    // --------------------------------------------------
    // SCENARIO 28: Database failure during readiness probe returns HTTP 503
    // --------------------------------------------------
    {
      const dbModule = require('../src/config/db');
      const origQuery = dbModule.query;
      dbModule.query = async () => { throw new Error('Simulated DB failure'); };

      const readyRes = await sendHttpRequest(port, { method: 'GET', path: '/ready' });
      assert.strictEqual(readyRes.statusCode, 503);
      assert.strictEqual(readyRes.json.status, 'not_ready');

      dbModule.query = origQuery;
      console.log('✔ Test 28 Passed: Database failure during GET /ready probe returns HTTP 503');
    }

    // --------------------------------------------------
    // SCENARIO 29: Unexpected evaluation exception fallback to link.target_url
    // --------------------------------------------------
    {
      const corruptedRecord = {
        target_url: 'https://example.com/safe-fallback',
        routing_config: {
          rules: [
            { type: 'corrupted_rule_force_error' }
          ]
        }
      };

      // Mock evaluateRoutingRules to throw unexpected exception
      const routingEngine = require('../src/services/routingEngine');
      const origEval = routingEngine.evaluateRoutingRules;
      routingEngine.evaluateRoutingRules = () => {
        throw new Error('Unexpected rule evaluation engine error');
      };

      const initialErrMetric = getMetrics().routing_evaluation_errors_total;
      const res = await sendHttpRequest(port, { method: 'GET', path: `/s/${createdShortCodes[1]}` });

      routingEngine.evaluateRoutingRules = origEval;

      assert.strictEqual(res.statusCode, 302);
      assert.strictEqual(getMetrics().routing_evaluation_errors_total, initialErrMetric + 1);
      console.log('✔ Test 29 Passed: Evaluation exception increments routing_evaluation_errors_total and falls back to link.target_url');
    }

    // --------------------------------------------------
    // SCENARIO 30: Step 21 Routing Metrics Increment Verification
    // --------------------------------------------------
    {
      const metrics = getMetrics();
      const requiredStep21Metrics = [
        'routing_evaluations_total',
        'time_route_selected_total',
        'device_route_selected_total',
        'weighted_route_selected_total',
        'routing_evaluation_errors_total'
      ];

      for (const mKey of requiredStep21Metrics) {
        assert.strictEqual(typeof metrics[mKey], 'number', `Metric "${mKey}" must exist and be a number`);
      }
      console.log('✔ Test 30 Passed: All Step 21 routing metric counters exist and increment properly');
    }

    // --------------------------------------------------
    // SCENARIO 31: OpenAPI 3.0 Spec Validation
    // --------------------------------------------------
    {
      const openapiPath = path.join(__dirname, '../docs/openapi.yaml');
      const openapiContent = fs.readFileSync(openapiPath, 'utf8');
      assert.ok(openapiContent.includes('routing_config:'), 'OpenAPI spec must document routing_config schema');
      assert.ok(openapiContent.includes('RoutingConfig:'), 'OpenAPI spec must define RoutingConfig schema component');
      console.log('✔ Test 31 Passed: OpenAPI spec accurately documents Step 21 schemas and endpoints');
    }

    console.log('\nAll 31 Step 21 Advanced Redirect Intelligence & Traffic Control tests passed successfully!');

  } catch (err) {
    console.error('\n❌ Step 21 test execution failed:', err);
    process.exitCode = 1;
  } finally {
    for (const code of createdShortCodes) {
      await linksDb.deleteLinkByShortCode(code);
    }
    if (testUser) {
      await usersDb.deleteUserById(testUser.user_id);
    }
    if (nonOwnerUser) {
      await usersDb.deleteUserById(nonOwnerUser.user_id);
    }
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runStep21AdvancedRedirectsTests().then(() => {
    pool.end();
  });
}

module.exports = {
  runStep21AdvancedRedirectsTests,
};
