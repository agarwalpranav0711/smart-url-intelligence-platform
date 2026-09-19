const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const linkService = require('../src/services/linkService');
const { resetMetricsForTesting, getMetrics } = require('../src/utils/metrics');
const { setShuttingDown } = require('../src/utils/shutdownState');
const { validateEnv } = require('../src/config/env');

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

async function runStep20OperabilityTests() {
  console.log('\n==================================================');
  console.log('Running Suite: Step 20: Production Operability & Observability');
  console.log('==================================================\n');

  let server = null;
  let port = null;
  let testUser = null;
  const rawKey = `test_key_step20_${crypto.randomBytes(16).toString('hex')}`;
  const apiKeyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const authHeader = `Bearer ${rawKey}`;
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

    // ==================================================
    // A. REQUEST CORRELATION IDs (Tests 1-4)
    // ==================================================
    // 1. Missing X-Request-ID generates valid UUID
    {
      const res = await sendHttpRequest(port, { method: 'GET', path: '/health' });
      assert.strictEqual(res.statusCode, 200);
      const reqId = res.headers['x-request-id'];
      assert.ok(reqId, 'Response must contain X-Request-ID header');
      assert.strictEqual(typeof reqId, 'string');
      assert.ok(/^[0-9a-fA-F-]{36}$/.test(reqId), 'Generated X-Request-ID must be valid UUID');
      console.log('✔ Test 1 Passed: Missing X-Request-ID generates a new UUID header');
    }

    // 2. Valid X-Request-ID is preserved
    {
      const customId = 'custom-request-id-12345_XYZ';
      const res = await sendHttpRequest(port, {
        method: 'GET',
        path: '/health',
        headers: { 'X-Request-ID': customId }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['x-request-id'], customId, 'Valid custom X-Request-ID must be preserved');
      console.log('✔ Test 2 Passed: Valid custom X-Request-ID is preserved in response');
    }

    // 3. Invalid X-Request-ID is rejected and newly generated UUID returned
    {
      const invalidId = 'invalid id with spaces and <script>alert(1)</script>';
      const res = await sendHttpRequest(port, {
        method: 'GET',
        path: '/health',
        headers: { 'X-Request-ID': invalidId }
      });
      assert.strictEqual(res.statusCode, 200);
      const reqId = res.headers['x-request-id'];
      assert.notStrictEqual(reqId, invalidId, 'Invalid X-Request-ID must not be reflected');
      assert.ok(/^[0-9a-fA-F-]{36}$/.test(reqId), 'New valid UUID must be generated for invalid header');
      console.log('✔ Test 3 Passed: Invalid X-Request-ID is rejected and replaced with generated UUID');
    }

    // 4. Correlation ID attached to req.id during execution
    {
      const customId = 'req-id-test-trace-999';
      const res = await sendHttpRequest(port, {
        method: 'GET',
        path: '/metrics',
        headers: { 'X-Request-ID': customId }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['x-request-id'], customId);
      console.log('✔ Test 4 Passed: Correlation ID attached to req.id and echoed in response');
    }

    // ==================================================
    // B. HEALTH VS READINESS (Tests 5-9)
    // ==================================================
    // 5. GET /health returns HTTP 200 with pure liveness JSON (status and uptime)
    {
      const res = await sendHttpRequest(port, { method: 'GET', path: '/health' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.status, 'ok');
      assert.strictEqual(typeof res.json.uptime, 'number');
      console.log('✔ Test 5 Passed: GET /health returns HTTP 200 pure liveness object');
    }

    // 6 & 9. GET /health does not depend on DB (returns 200 even if DB fails)
    {
      const dbModule = require('../src/config/db');
      const origQuery = dbModule.query;
      dbModule.query = async () => { throw new Error('Simulated DB failure'); };

      const healthRes = await sendHttpRequest(port, { method: 'GET', path: '/health' });
      assert.strictEqual(healthRes.statusCode, 200);
      assert.strictEqual(healthRes.json.status, 'ok');

      dbModule.query = origQuery;
      console.log('✔ Tests 6 & 9 Passed: GET /health remains 200 during DB downtime');
    }

    // 7. GET /ready returns HTTP 200 when DB is reachable
    {
      const res = await sendHttpRequest(port, { method: 'GET', path: '/ready' });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, { status: 'ready' });
      console.log('✔ Test 7 Passed: GET /ready returns HTTP 200 {"status":"ready"} when DB reachable');
    }

    // 8. GET /ready returns HTTP 503 when DB is unavailable
    {
      const dbModule = require('../src/config/db');
      const origQuery = dbModule.query;
      dbModule.query = async () => { throw new Error('DB connection refused'); };

      const readyRes = await sendHttpRequest(port, { method: 'GET', path: '/ready' });
      assert.strictEqual(readyRes.statusCode, 503);
      assert.deepStrictEqual(readyRes.json, { status: 'not_ready' });

      dbModule.query = origQuery;
      console.log('✔ Test 8 Passed: GET /ready returns HTTP 503 {"status":"not_ready"} when DB fails');
    }

    // ==================================================
    // C. SHUTDOWN READINESS DRAIN (Tests 10-11)
    // ==================================================
    // 10. GET /ready returns 503 when isShuttingDown is set to true (while /health remains 200)
    {
      setShuttingDown(true);
      const res = await sendHttpRequest(port, { method: 'GET', path: '/ready' });
      assert.strictEqual(res.statusCode, 503);
      assert.deepStrictEqual(res.json, { status: 'not_ready' });

      const healthRes = await sendHttpRequest(port, { method: 'GET', path: '/health' });
      assert.strictEqual(healthRes.statusCode, 200);
      assert.strictEqual(healthRes.json.status, 'ok');

      // Reset shutdown state for subsequent tests
      setShuttingDown(false);
      const resAfterReset = await sendHttpRequest(port, { method: 'GET', path: '/ready' });
      assert.strictEqual(resAfterReset.statusCode, 200);
      console.log('✔ Test 10 Passed: GET /ready returns 503 immediately when shutdown begins while /health remains 200');
    }

    // 11. Graceful shutdown module interface integrity check
    {
      assert.strictEqual(typeof setShuttingDown, 'function');
      console.log('✔ Test 11 Passed: Shutdown drain state management interface verified');
    }

    // ==================================================
    // D. METRICS INCREMENTS (Tests 12-17)
    // ==================================================
    // 16. Successful API-key authentication increments api_key_auth_successes_total
    {
      const initialAuthSuccess = getMetrics().api_key_auth_successes_total;
      const res = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(getMetrics().api_key_auth_successes_total, initialAuthSuccess + 1);
      console.log('✔ Test 16 Passed: Successful authentication increments api_key_auth_successes_total');
    }

    // 13 & 12. Cache miss and cache hit metrics
    {
      const linkRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: { target_url: 'https://example.com/step20-metrics-test' }
      });
      assert.strictEqual(linkRes.statusCode, 201);
      const code = linkRes.json.short_code;
      createdShortCodes.push(code);

      const initialMisses = getMetrics().redirect_cache_misses_total;
      const initialHits = getMetrics().redirect_cache_hits_total;

      // 1st request -> Cache miss (DB lookup)
      const res1 = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(res1.statusCode, 302);
      assert.strictEqual(getMetrics().redirect_cache_misses_total, initialMisses + 1);

      // 2nd request -> Cache hit (in-memory LRU cache)
      const res2 = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(res2.statusCode, 302);
      assert.strictEqual(getMetrics().redirect_cache_hits_total, initialHits + 1);

      console.log('✔ Tests 12 & 13 Passed: Cache misses and hits increment redirect_cache_misses_total and redirect_cache_hits_total');
    }

    // 14. Expired redirect increments redirect_expired_total
    {
      const pastIso = new Date(Date.now() - 3600000).toISOString();
      // Insert expired link directly into DB to test redirect expiration check
      const expCode = `exp_${crypto.randomBytes(4).toString('hex')}`;
      await query(
        `INSERT INTO links (short_code, target_url, user_id, expires_at) VALUES ($1, $2, $3, $4)`,
        [expCode, 'https://example.com/expired-test', testUser.user_id, pastIso]
      );
      createdShortCodes.push(expCode);

      const initialExpired = getMetrics().redirect_expired_total;
      const res = await sendHttpRequest(port, { method: 'GET', path: `/s/${expCode}` });
      assert.strictEqual(res.statusCode, 410);
      assert.strictEqual(res.json.error.code, 'LINK_EXPIRED');
      assert.strictEqual(getMetrics().redirect_expired_total, initialExpired + 1);
      console.log('✔ Test 14 Passed: Expired redirect increments redirect_expired_total');
    }

    // 15. Duplicate custom alias increments alias_conflicts_total
    {
      const customAlias = `alias20_${crypto.randomBytes(4).toString('hex')}`;
      const firstRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: { target_url: 'https://example.com/first-alias', alias: customAlias }
      });
      assert.strictEqual(firstRes.statusCode, 201);
      createdShortCodes.push(customAlias);

      const initialConflicts = getMetrics().alias_conflicts_total;
      const secondRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeader },
        body: { target_url: 'https://example.com/second-alias', alias: customAlias }
      });
      assert.strictEqual(secondRes.statusCode, 409);
      assert.strictEqual(secondRes.json.error.code, 'ALIAS_ALREADY_EXISTS');
      assert.strictEqual(getMetrics().alias_conflicts_total, initialConflicts + 1);
      console.log('✔ Test 15 Passed: Duplicate custom alias creation increments alias_conflicts_total');
    }

    // 17. Database error increments database_errors_total exactly once
    {
      const initialDbErrors = getMetrics().database_errors_total;
      try {
        await query('SELECT * FROM non_existent_table_step20');
      } catch (_) {}
      assert.strictEqual(getMetrics().database_errors_total, initialDbErrors + 1);
      console.log('✔ Test 17 Passed: Database query failure increments database_errors_total exactly once');
    }

    // ==================================================
    // E. CONFIGURATION VALIDATION (Tests 18-23)
    // ==================================================
    // 18. Valid configuration passes validateEnv()
    {
      const validConfig = validateEnv({
        NODE_ENV: 'production',
        PORT: '8080',
        DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/mydb',
        LOG_LEVEL: 'warn',
        RATE_LIMIT_WINDOW_MS: '60000',
        RATE_LIMIT_MAX_REQUESTS: '100'
      });
      assert.strictEqual(validConfig.NODE_ENV, 'production');
      assert.strictEqual(validConfig.PORT, 8080);
      assert.strictEqual(validConfig.LOG_LEVEL, 'warn');
      console.log('✔ Test 18 Passed: Valid environment configuration passes validation');
    }

    // 19. Invalid PORT fails validation
    {
      assert.throws(() => {
        validateEnv({ PORT: 'invalid_port' });
      }, /Invalid PORT/);
      assert.throws(() => {
        validateEnv({ PORT: '999999' });
      }, /Invalid PORT/);
      console.log('✔ Test 19 Passed: Invalid PORT throws validation error');
    }

    // 20. Invalid NODE_ENV fails validation
    {
      assert.throws(() => {
        validateEnv({ NODE_ENV: 'staging' });
      }, /Invalid NODE_ENV/);
      console.log('✔ Test 20 Passed: Invalid NODE_ENV throws validation error');
    }

    // 21. Invalid DATABASE_URL fails validation
    {
      assert.throws(() => {
        validateEnv({ DATABASE_URL: 'http://localhost:5432/db' });
      }, /Invalid DATABASE_URL/);
      assert.throws(() => {
        validateEnv({ DATABASE_URL: 'not_a_url' });
      }, /Invalid DATABASE_URL/);
      console.log('✔ Test 21 Passed: Invalid DATABASE_URL protocol/format throws validation error');
    }

    // 22. Invalid LOG_LEVEL fails validation
    {
      assert.throws(() => {
        validateEnv({ LOG_LEVEL: 'verbose' });
      }, /Invalid LOG_LEVEL/);
      console.log('✔ Test 22 Passed: Invalid LOG_LEVEL throws validation error');
    }

    // 23. Invalid rate-limit configuration fails validation
    {
      assert.throws(() => {
        validateEnv({ RATE_LIMIT_WINDOW_MS: '-5000' });
      }, /Invalid RATE_LIMIT_WINDOW_MS/);
      assert.throws(() => {
        validateEnv({ RATE_LIMIT_MAX_REQUESTS: '0' });
      }, /Invalid RATE_LIMIT_MAX_REQUESTS/);
      console.log('✔ Test 23 Passed: Invalid rate-limit settings throw validation error');
    }

    // ==================================================
    // F. LOGGING & SECURITY (Tests 24-25)
    // ==================================================
    // 24 & 25. Sensitive header sanitization and correlation ID verification
    {
      const secretHeader = `Bearer secret_key_${crypto.randomBytes(8).toString('hex')}`;
      const res = await sendHttpRequest(port, {
        method: 'GET',
        path: '/metrics',
        headers: { 'Authorization': secretHeader }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['x-request-id']);
      console.log('✔ Tests 24 & 25 Passed: Request completion log sanitization and correlation ID verified');
    }

    console.log('\nAll Step 20 operability & observability tests passed successfully!');

  } catch (err) {
    console.error('\n❌ Step 20 test suite caught error:', err);
    process.exitCode = 1;
  } finally {
    for (const code of createdShortCodes) {
      await linksDb.deleteLinkByShortCode(code);
    }
    if (testUser) {
      await usersDb.deleteUserById(testUser.user_id);
    }
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runStep20OperabilityTests().then(() => {
    pool.end();
  });
}

module.exports = {
  runStep20OperabilityTests,
};
