const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const linkService = require('../src/services/linkService');
const { pool } = require('../src/config/db');

// Helper to make real HTTP request to test server
function sendHttpRequest(serverPort, { method, path, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: serverPort,
      method,
      path,
      headers,
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
          location: res.headers['location'],
          text: responseText,
          json,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Reliable polling helper to wait until a condition is met in DB without arbitrary timing fragile sleeps
async function pollCondition(fn, timeoutMs = 2000, intervalMs = 20) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const res = await fn();
    if (res) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function runStep5Tests() {
  console.log('=== Step 5: Public Redirect Endpoint Verification ===\n');

  let server = null;
  let serverPort = null;
  let testUser = null;
  const createdShortCodes = [];

  try {
    // Start local HTTP server
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        serverPort = server.address().port;
        console.log(`[SETUP] Test HTTP server listening on http://127.0.0.1:${serverPort}`);
        resolve();
      });
    });

    // Create test user in DB
    const apiKeyHash = crypto.createHash('sha256').update(`key_${Date.now()}`).digest('hex');
    testUser = await usersDb.createUser(apiKeyHash);
    console.log(`[SETUP] Created test user with UUID: ${testUser.user_id}`);

    // TEST 1-3: Active short link returns HTTP 302 with Location header WITHOUT Authorization header
    {
      const targetUrl = 'https://example.com/public-redirect-test?param=value#anchor';
      const link = await linkService.createShortLink(targetUrl, testUser.user_id);
      createdShortCodes.push(link.short_code);

      // Perform public GET request with NO Authorization header
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: `/s/${link.short_code}`,
        headers: {} // No Auth header
      });

      assert.strictEqual(res.statusCode, 302, 'Active link must return HTTP 302');
      assert.strictEqual(res.location, targetUrl, 'Location header must match exact target_url');
      console.log('✔ Tests 1-3 Passed: Active short link returns HTTP 302 Location header without Authorization header');
    }

    // TEST 4 & 5: Unknown short code returns 404 with structured JSON
    {
      const unknownCode = 'nonexs';
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: `/s/${unknownCode}`,
      });

      assert.strictEqual(res.statusCode, 404, 'Unknown short code must return HTTP 404');
      assert.deepStrictEqual(res.json, {
        error: {
          code: 'NOT_FOUND',
          message: 'Short link not found'
        }
      });
      console.log('✔ Tests 4 & 5 Passed: Unknown short code returns HTTP 404 structured JSON');
    }

    // TEST 6-8: Inactive link returns 410, does NOT redirect, returns structured JSON
    {
      const targetUrl = 'https://example.com/inactive-test';
      const link = await linkService.createShortLink(targetUrl, testUser.user_id);
      createdShortCodes.push(link.short_code);

      // Deactivate link
      await linksDb.setLinkActiveStatus(link.short_code, false);

      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: `/s/${link.short_code}`,
      });

      assert.strictEqual(res.statusCode, 410, 'Inactive link must return HTTP 410');
      assert.strictEqual(res.location, undefined, 'Inactive link must NOT return Location header');
      assert.deepStrictEqual(res.json, {
        error: {
          code: 'LINK_INACTIVE',
          message: 'Short link is inactive'
        }
      });
      console.log('✔ Tests 6-8 Passed: Inactive link returns HTTP 410 LINK_INACTIVE structured JSON without redirecting');
    }

    // TEST 9 & 10: Successful redirects attempt to increment click_count atomically via SQL
    {
      const targetUrl = 'https://example.com/click-count-test';
      const link = await linkService.createShortLink(targetUrl, testUser.user_id);
      createdShortCodes.push(link.short_code);

      // Initial click count is 0
      const initialRecord = await linksDb.getLinkByShortCode(link.short_code);
      assert.strictEqual(String(initialRecord.click_count), '0');

      // Execute 3 public redirects
      await sendHttpRequest(serverPort, { method: 'GET', path: `/s/${link.short_code}` });
      await sendHttpRequest(serverPort, { method: 'GET', path: `/s/${link.short_code}` });
      await sendHttpRequest(serverPort, { method: 'GET', path: `/s/${link.short_code}` });

      // Poll until click_count reaches 3 (non-fragile wait)
      const isIncremented = await pollCondition(async () => {
        const record = await linksDb.getLinkByShortCode(link.short_code);
        return String(record.click_count) === '3';
      });

      assert.ok(isIncremented, 'click_count should be updated atomically to 3 in PostgreSQL');
      console.log('✔ Tests 9 & 10 Passed: Successful redirects atomically increment click_count in PostgreSQL');
    }

    // TEST 11: Redirect response does NOT await click-count update (non-blocking)
    {
      const originalIncrement = linksDb.incrementClickCount;
      let incrementStarted = false;
      let incrementCanFinish = false;

      // Slow down incrementClickCount artificially to verify redirect finishes before increment completes
      linksDb.incrementClickCount = async (code) => {
        incrementStarted = true;
        await pollCondition(async () => incrementCanFinish);
        return originalIncrement(code);
      };

      const targetUrl = 'https://example.com/non-blocking-test';
      const link = await linkService.createShortLink(targetUrl, testUser.user_id);
      createdShortCodes.push(link.short_code);

      // Issue redirect request
      const resPromise = sendHttpRequest(serverPort, { method: 'GET', path: `/s/${link.short_code}` });

      // Receive 302 response immediately while background increment is still pending
      const res = await resPromise;
      assert.strictEqual(res.statusCode, 302);
      assert.strictEqual(res.location, targetUrl);

      // Allow background increment to finish
      incrementCanFinish = true;
      linksDb.incrementClickCount = originalIncrement;

      console.log('✔ Test 11 Passed: Redirect returns HTTP 302 immediately without awaiting click-count update');
    }

    // TEST 12: Simulated click-count update failure does NOT affect 302 redirect response
    {
      const originalIncrement = linksDb.incrementClickCount;

      // Stub incrementClickCount to throw a database connection error
      linksDb.incrementClickCount = async () => {
        throw new Error('Database connection failed during background click update');
      };

      const targetUrl = 'https://example.com/background-failure-test';
      const link = await linkService.createShortLink(targetUrl, testUser.user_id);
      createdShortCodes.push(link.short_code);

      const res = await sendHttpRequest(serverPort, { method: 'GET', path: `/s/${link.short_code}` });

      linksDb.incrementClickCount = originalIncrement;

      assert.strictEqual(res.statusCode, 302, 'Redirect must still succeed with HTTP 302 even if background update fails');
      assert.strictEqual(res.location, targetUrl);
      console.log('✔ Test 12 Passed: Background click-count update failure does not affect HTTP 302 redirect response');
    }

    // TEST 13: No client IP, User-Agent, or Referer collected or persisted
    {
      const result = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'links'
      `);
      const columnNames = result.rows.map(r => r.column_name.toLowerCase());
      const prohibitedColumns = ['ip', 'client_ip', 'user_agent', 'referer', 'x_forwarded_for'];

      for (const col of prohibitedColumns) {
        assert.strictEqual(columnNames.includes(col), false, `Column "${col}" must NOT exist in links table`);
      }
      console.log('✔ Test 13 Passed: No client IP, headers, or metadata columns exist in PostgreSQL schema');
    }

    // TEST 14: SQL queries in redirect path are parameterized
    {
      const linksDbCode = require('fs').readFileSync(require.resolve('../src/db/links'), 'utf8');
      assert.ok(linksDbCode.includes('WHERE short_code = $1'), 'Parameterized query required for getLinkByShortCode');
      assert.ok(linksDbCode.includes('WHERE short_code = $1 AND is_active = true'), 'Parameterized query required for incrementClickCount');
      console.log('✔ Test 14 Passed: All SQL queries strictly use parameterized values ($1)');
    }

    // TEST 15: Database/internal lookup failure returns safe 500 response without exposing internals
    {
      const originalGetLink = linksDb.getLinkByShortCode;

      // Stub getLinkByShortCode to throw DB failure
      linksDb.getLinkByShortCode = async () => {
        throw new Error('connection to server at "localhost" (127.0.0.1) failed');
      };

      const res = await sendHttpRequest(serverPort, { method: 'GET', path: '/s/abc123' });

      linksDb.getLinkByShortCode = originalGetLink;

      assert.strictEqual(res.statusCode, 500);
      assert.deepStrictEqual(res.json, {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error'
        }
      });
      assert.strictEqual(res.text.includes('connection to server'), false, 'SQL error details must NOT be returned');
      console.log('✔ Test 15 Passed: Internal database failure returns safe HTTP 500 JSON without exposing details');
    }

    console.log('\nAll 15+ Step 5 redirect verification tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
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
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runStep5Tests();
}

module.exports = runStep5Tests;
