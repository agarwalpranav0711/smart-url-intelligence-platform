const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const { pool } = require('../src/config/db');
const { BASE62_ALPHABET } = require('../src/utils/base62');

// Helper to make real HTTP request to test server
function sendHttpRequest(serverPort, { method, path, headers = {}, body = null, rawBody = null }) {
  return new Promise((resolve, reject) => {
    let payload = null;
    if (rawBody !== null) {
      payload = Buffer.from(rawBody);
    } else if (body !== null) {
      payload = Buffer.from(JSON.stringify(body));
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
      port: serverPort,
      method,
      path,
      headers: reqHeaders,
    }, (res) => {
      let responseText = '';
      res.on('data', (chunk) => {
        responseText += chunk;
      });
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

async function runStep4Tests() {
  console.log('=== Step 4: Create Short Link API Verification ===\n');

  let server = null;
  let serverPort = null;
  let testUser = null;
  const rawTestApiKey = `test_key_step4_${crypto.randomBytes(16).toString('hex')}`;
  const testApiKeyHash = crypto.createHash('sha256').update(rawTestApiKey).digest('hex');
  const validAuthHeader = `Bearer ${rawTestApiKey}`;

  const createdShortCodes = [];

  try {
    // Start local HTTP server for real integration testing
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        console.log(`[SETUP] Test HTTP server listening on http://127.0.0.1:${serverPort}`);
        resolve();
      });
    });

    // Setup test user in DB
    testUser = await usersDb.createUser(testApiKeyHash);
    console.log(`[SETUP] Created test user with UUID: ${testUser.user_id}`);

    // TEST 1: No Authorization header -> 401
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Content-Type': 'application/json' },
        body: { target_url: 'https://example.com' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.json, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      console.log('✔ Test 1 Passed: Missing Authorization header returns HTTP 401');
    }

    // TEST 2: Invalid API key -> 401
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': 'Bearer invalid_key_999999', 'Content-Type': 'application/json' },
        body: { target_url: 'https://example.com' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.json, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      console.log('✔ Test 2 Passed: Invalid Bearer API key returns HTTP 401');
    }

    // TEST 3: Missing target_url -> 400
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: {}
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      console.log('✔ Test 3 Passed: Missing target_url returns HTTP 400');
    }

    // TEST 4: target_url is not a string -> 400
    {
      const invalidTypes = [12345, true, false, ['https://example.com'], { url: 'https://example.com' }];
      for (const val of invalidTypes) {
        const res = await sendHttpRequest(serverPort, {
          method: 'POST',
          path: '/api/v1/links',
          headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
          body: { target_url: val }
        });
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      }
      console.log('✔ Test 4 Passed: Non-string target_url returns HTTP 400');
    }

    // TEST 5: Empty target_url -> 400
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: '' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      console.log('✔ Test 5 Passed: Empty target_url returns HTTP 400');
    }

    // TEST 6: Whitespace-only target_url -> 400
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: '     ' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      console.log('✔ Test 6 Passed: Whitespace-only target_url returns HTTP 400');
    }

    // TEST 7: Invalid URL syntax -> 400
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: 'not-a-valid-url' }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      console.log('✔ Test 7 Passed: Invalid URL syntax returns HTTP 400');
    }

    // TEST 8-12: Prohibited URL schemes (javascript:, data:, file:, ftp:, ws:) -> 400
    {
      const prohibitedUrls = [
        'javascript:alert("hacked")',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'file:///etc/passwd',
        'ftp://dl.example.com/file.zip',
        'ws://websocket.example.com'
      ];
      for (const url of prohibitedUrls) {
        const res = await sendHttpRequest(serverPort, {
          method: 'POST',
          path: '/api/v1/links',
          headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
          body: { target_url: url }
        });
        assert.strictEqual(res.statusCode, 400, `Expected 400 for scheme "${url}"`);
        assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      }
      console.log('✔ Tests 8-12 Passed: Prohibited schemes (javascript, data, file, ftp, ws) return HTTP 400');
    }

    // TEST 13: URL > 2048 characters -> 400
    {
      const longUrl = 'https://example.com/' + 'a'.repeat(2040); // 2060 characters
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: longUrl }
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      console.log('✔ Test 13 Passed: URL > 2048 characters returns HTTP 400');
    }

    // TEST 14 & 16-18: Valid HTTP URL -> 201 & short_code format check
    {
      const httpUrl = 'http://example.com/test-http-link?query=1#hash';
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: httpUrl }
      });
      assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${res.text}`);
      assert.ok(res.json.short_code);
      assert.strictEqual(res.json.target_url, httpUrl);
      assert.ok(res.json.created_at);

      const shortCode = res.json.short_code;
      createdShortCodes.push(shortCode);

      assert.strictEqual(shortCode.length, 6, 'short_code must be exactly 6 characters');
      for (const char of shortCode) {
        assert.ok(BASE62_ALPHABET.includes(char), `Character "${char}" must be in Base62 alphabet`);
      }
      console.log('✔ Tests 14 & 16-18 Passed: Valid HTTP URL creates 6-char Base62 link with HTTP 201');
    }

    // TEST 15 & 19-22: Valid HTTPS URL -> 201, un-normalized exact URL, user ownership, click_count 0, is_active true
    {
      const rawHttpsUrl = 'https://Example.COM:443/Path/To/Resource?Key=Value&Foo=Bar#Fragment';
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: rawHttpsUrl }
      });
      assert.strictEqual(res.statusCode, 201);
      const shortCode = res.json.short_code;
      createdShortCodes.push(shortCode);

      // Verify returned target_url is original un-normalized string
      assert.strictEqual(res.json.target_url, rawHttpsUrl, 'Returned target_url must match supplied string exactly');

      // Verify PostgreSQL DB record directly
      const dbRecord = await linksDb.getLinkByShortCode(shortCode);
      assert.ok(dbRecord, 'DB record must exist');
      assert.strictEqual(dbRecord.target_url, rawHttpsUrl, 'Stored target_url in PostgreSQL must match original string');
      assert.strictEqual(dbRecord.user_id, testUser.user_id, 'DB record must belong to authenticated user');
      assert.strictEqual(String(dbRecord.click_count), '0', 'click_count must start at 0');
      assert.strictEqual(dbRecord.is_active, true, 'is_active must start as true');

      console.log('✔ Tests 15 & 19-22 Passed: Valid HTTPS URL stored as exact un-normalized string with owner, click_count 0, is_active true');
    }

    // TEST 23: Client-supplied user_id cannot override authenticated ownership
    {
      const fakeUserId = '00000000-0000-0000-0000-000000000000';
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: 'https://example.com/override-test', user_id: fakeUserId }
      });
      assert.strictEqual(res.statusCode, 201);
      const shortCode = res.json.short_code;
      createdShortCodes.push(shortCode);

      const dbRecord = await linksDb.getLinkByShortCode(shortCode);
      assert.strictEqual(dbRecord.user_id, testUser.user_id, 'DB user_id must remain authenticated user, NOT fake user_id');
      console.log('✔ Test 23 Passed: Client-supplied user_id cannot override authenticated ownership');
    }

    // TEST 24: PostgreSQL 23505 collision causes another code to be generated
    {
      const originalCreateLink = linksDb.createLink;
      let callCount = 0;

      // Stub createLink to throw 23505 on 1st call, succeed on 2nd call
      linksDb.createLink = async (code, targetUrl, userId) => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('duplicate key value violates unique constraint "links_pkey"');
          err.code = '23505';
          throw err;
        }
        return originalCreateLink(code, targetUrl, userId);
      };

      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: 'https://example.com/collision-test-1' }
      });

      linksDb.createLink = originalCreateLink;

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(callCount, 2, 'createLink must be called twice due to 1 collision');
      createdShortCodes.push(res.json.short_code);
      console.log('✔ Test 24 Passed: PostgreSQL 23505 collision automatically retries and succeeds on next attempt');
    }

    // TEST 25 & 26: Three consecutive simulated collisions result in HTTP 500 (max 3 total attempts)
    {
      const originalCreateLink = linksDb.createLink;
      let callCount = 0;

      // Stub createLink to throw 23505 on all calls
      linksDb.createLink = async () => {
        callCount++;
        const err = new Error('duplicate key value violates unique constraint "links_pkey"');
        err.code = '23505';
        throw err;
      };

      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: 'https://example.com/collision-test-max' }
      });

      linksDb.createLink = originalCreateLink;

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(callCount, 3, 'createLink must be called exactly 3 times before giving up');
      assert.deepStrictEqual(res.json, {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }
      });
      console.log('✔ Tests 25 & 26 Passed: 3 consecutive 23505 collisions result in HTTP 500 after 3 total attempts');
    }

    // TEST 27 & 28: Non-23505 PostgreSQL error results in HTTP 500 and is NOT retried
    {
      const originalCreateLink = linksDb.createLink;
      let callCount = 0;

      // Stub createLink to throw connection error (non-23505)
      linksDb.createLink = async () => {
        callCount++;
        const err = new Error('connection to server at "localhost" (127.0.0.1) failed');
        err.code = '08006'; // connection_failure
        throw err;
      };

      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: 'https://example.com/conn-error-test' }
      });

      linksDb.createLink = originalCreateLink;

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(callCount, 1, 'createLink must be called ONLY 1 time for non-23505 error');
      assert.deepStrictEqual(res.json, {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }
      });
      console.log('✔ Tests 27 & 28 Passed: Non-23505 PostgreSQL error is not retried and returns HTTP 500 without DB details');
    }

    // TEST 29: SQL queries use parameterized values
    {
      const linksDbCode = require('fs').readFileSync(require.resolve('../src/db/links'), 'utf8');
      assert.ok(linksDbCode.includes('$1'), 'links.js must use $1 parameter placeholders');
      assert.strictEqual(linksDbCode.includes('${'), false, 'links.js must NOT use string template interpolation for values');
      console.log('✔ Test 29 Passed: SQL queries in links.js strictly use parameterized values ($1, $2, $3)');
    }

    // TEST 30: API keys are never logged or returned in responses
    {
      let consoleLogCalled = false;
      let consoleErrorCalled = false;
      const originalLog = console.log;
      const originalError = console.error;

      console.log = (...args) => {
        const text = args.join(' ');
        if (text.includes(rawTestApiKey)) consoleLogCalled = true;
      };
      console.error = (...args) => {
        const text = args.join(' ');
        if (text.includes(rawTestApiKey)) consoleErrorCalled = true;
      };

      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        body: { target_url: 'https://example.com/no-log-check' }
      });

      console.log = originalLog;
      console.error = originalError;

      assert.strictEqual(res.statusCode, 201);
      createdShortCodes.push(res.json.short_code);
      assert.strictEqual(consoleLogCalled, false);
      assert.strictEqual(consoleErrorCalled, false);
      assert.strictEqual(res.text.includes(rawTestApiKey), false);
      console.log('✔ Test 30 Passed: Plaintext API key is never logged or exposed in HTTP responses');
    }

    // BONUS TEST: Malformed JSON body handling -> 400 INVALID_REQUEST
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { 'Authorization': validAuthHeader, 'Content-Type': 'application/json' },
        rawBody: '{ "target_url": "https://example.com", malformed json syntax }'
      });
      assert.strictEqual(res.statusCode, 400);
      assert.deepStrictEqual(res.json, {
        error: { code: 'INVALID_REQUEST', message: 'Malformed JSON payload' }
      });
      console.log('✔ Bonus Test Passed: Malformed JSON payload returns HTTP 400 structured JSON');
    }

    console.log('\nAll 30+ Step 4 verification tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    // Clean up created short codes
    for (const code of createdShortCodes) {
      await linksDb.deleteLinkByShortCode(code);
    }
    console.log(`[CLEANUP] Deleted ${createdShortCodes.length} temporary test links`);

    // Clean up test user
    if (testUser) {
      await usersDb.deleteUserById(testUser.user_id);
      console.log(`[CLEANUP] Test user ${testUser.user_id} deleted`);
    }

    if (server) {
      server.close();
    }

    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runStep4Tests();
}

module.exports = runStep4Tests;
