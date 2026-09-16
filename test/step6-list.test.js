const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const linkService = require('../src/services/linkService');
const { pool } = require('../src/config/db');

// Helper to send HTTP requests to test server
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
          text: responseText,
          json,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runStep6Tests() {
  console.log('=== Step 6: Authenticated Link Listing Verification ===\n');

  let server = null;
  let serverPort = null;

  // Test User A
  let userA = null;
  const rawKeyA = `test_key_userA_${crypto.randomBytes(16).toString('hex')}`;
  const hashA = crypto.createHash('sha256').update(rawKeyA).digest('hex');
  const authHeaderA = `Bearer ${rawKeyA}`;

  // Test User B
  let userB = null;
  const rawKeyB = `test_key_userB_${crypto.randomBytes(16).toString('hex')}`;
  const hashB = crypto.createHash('sha256').update(rawKeyB).digest('hex');
  const authHeaderB = `Bearer ${rawKeyB}`;

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

    // Create test users in DB
    userA = await usersDb.createUser(hashA);
    userB = await usersDb.createUser(hashB);
    console.log(`[SETUP] Created User A (${userA.user_id}) and User B (${userB.user_id})`);

    // TEST 1: Missing Authorization header -> 401
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links'
      });
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.json, {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      console.log('✔ Test 1 Passed: Missing Authorization header returns HTTP 401');
    }

    // TEST 2: Invalid API key -> 401
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': 'Bearer invalid_key_12345' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.json, {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      console.log('✔ Test 2 Passed: Invalid Bearer API key returns HTTP 401');
    }

    // TEST 23: Empty result returns HTTP 200 with links: [], limit: 20, offset: 0
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeaderA }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, {
        links: [],
        limit: 20,
        offset: 0
      });
      console.log('✔ Test 23 Passed: User with zero links returns HTTP 200 with empty array');
    }

    // Create 3 links for User A and 2 links for User B
    const linkA1 = await linkService.createShortLink('https://user-a-link1.com', userA.user_id);
    createdShortCodes.push(linkA1.short_code);
    await new Promise((r) => setTimeout(r, 10)); // Ensure distinct timestamps

    const linkA2 = await linkService.createShortLink('https://user-a-link2.com', userA.user_id);
    createdShortCodes.push(linkA2.short_code);
    await new Promise((r) => setTimeout(r, 10));

    const linkA3 = await linkService.createShortLink('https://user-a-link3.com', userA.user_id);
    createdShortCodes.push(linkA3.short_code);

    const linkB1 = await linkService.createShortLink('https://user-b-link1.com', userB.user_id);
    createdShortCodes.push(linkB1.short_code);

    const linkB2 = await linkService.createShortLink('https://user-b-link2.com', userB.user_id);
    createdShortCodes.push(linkB2.short_code);

    // TEST 3-8, 11-12, 24: User A retrieves their own links with defaults & ordering
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeaderA }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.limit, 20);
      assert.strictEqual(res.json.offset, 0);
      assert.strictEqual(res.json.links.length, 3, 'User A should have exactly 3 links');

      // Verify fields of returned links
      for (const item of res.json.links) {
        assert.ok(item.short_code);
        assert.ok(item.target_url);
        assert.strictEqual(typeof item.click_count, 'number');
        assert.strictEqual(typeof item.is_active, 'boolean');
        assert.ok(item.created_at);

        // Security checks
        assert.strictEqual(item.api_key_hash, undefined, 'api_key_hash must NOT be exposed');
        assert.strictEqual(item.user_id, undefined, 'user_id field does not need to be in item payload');
        assert.strictEqual(res.text.includes(rawKeyA), false, 'Raw API key must NOT be exposed');
      }

      // Ordering check (created_at DESC -> linkA3 first, then linkA2, then linkA1)
      assert.strictEqual(res.json.links[0].short_code, linkA3.short_code);
      assert.strictEqual(res.json.links[1].short_code, linkA2.short_code);
      assert.strictEqual(res.json.links[2].short_code, linkA1.short_code);

      console.log('✔ Tests 3-8, 11-12, 24 Passed: Valid API key returns HTTP 200 with owned links ordered newest-first');
    }

    // TEST 9-10: Ownership isolation (User A cannot see User B's links, ?user_id parameter ignored)
    {
      // User A GET request attempting to pass ?user_id=<User B ID>
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: `/api/v1/links?user_id=${userB.user_id}`,
        headers: { 'Authorization': authHeaderA }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.json.links.length, 3, 'User A must still receive only User A links');
      const codes = res.json.links.map(l => l.short_code);
      assert.strictEqual(codes.includes(linkB1.short_code), false, 'User B link must NOT be visible to User A');
      assert.strictEqual(codes.includes(linkB2.short_code), false, 'User B link must NOT be visible to User A');

      // User B GET request receives only User B's 2 links
      const resB = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeaderB }
      });
      assert.strictEqual(resB.statusCode, 200);
      assert.strictEqual(resB.json.links.length, 2, 'User B should see only their own 2 links');

      console.log('✔ Tests 9-10 Passed: Ownership isolation enforced; ?user_id override attempts fail safely');
    }

    // TEST 13 & 14: Pagination limit and offset work properly
    {
      // Limit = 2
      const resLimit = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links?limit=2',
        headers: { 'Authorization': authHeaderA }
      });
      assert.strictEqual(resLimit.statusCode, 200);
      assert.strictEqual(resLimit.json.limit, 2);
      assert.strictEqual(resLimit.json.offset, 0);
      assert.strictEqual(resLimit.json.links.length, 2);
      assert.strictEqual(resLimit.json.links[0].short_code, linkA3.short_code);
      assert.strictEqual(resLimit.json.links[1].short_code, linkA2.short_code);

      // Offset = 1, Limit = 2
      const resOffset = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links?limit=2&offset=1',
        headers: { 'Authorization': authHeaderA }
      });
      assert.strictEqual(resOffset.statusCode, 200);
      assert.strictEqual(resOffset.json.limit, 2);
      assert.strictEqual(resOffset.json.offset, 1);
      assert.strictEqual(resOffset.json.links.length, 2);
      assert.strictEqual(resOffset.json.links[0].short_code, linkA2.short_code);
      assert.strictEqual(resOffset.json.links[1].short_code, linkA1.short_code);

      console.log('✔ Tests 13 & 14 Passed: Pagination limit and offset parameters work accurately');
    }

    // TEST 15-19: Invalid limit parameter values -> 400 INVALID_REQUEST
    {
      const invalidLimits = ['101', '0', '-1', '1.5', 'abc', ''];
      for (const lim of invalidLimits) {
        const res = await sendHttpRequest(serverPort, {
          method: 'GET',
          path: `/api/v1/links?limit=${lim}`,
          headers: { 'Authorization': authHeaderA }
        });
        assert.strictEqual(res.statusCode, 400, `Expected 400 for limit="${lim}"`);
        assert.deepStrictEqual(res.json, {
          error: { code: 'INVALID_REQUEST', message: 'Invalid limit' }
        });
      }
      console.log('✔ Tests 15-19 Passed: Invalid limit values (0, >100, negative, decimal, non-numeric) return HTTP 400');
    }

    // TEST 20-22: Invalid offset parameter values -> 400 INVALID_REQUEST
    {
      const invalidOffsets = ['-1', '1.5', 'abc'];
      for (const off of invalidOffsets) {
        const res = await sendHttpRequest(serverPort, {
          method: 'GET',
          path: `/api/v1/links?offset=${off}`,
          headers: { 'Authorization': authHeaderA }
        });
        assert.strictEqual(res.statusCode, 400, `Expected 400 for offset="${off}"`);
        assert.deepStrictEqual(res.json, {
          error: { code: 'INVALID_REQUEST', message: 'Invalid offset' }
        });
      }
      console.log('✔ Tests 20-22 Passed: Invalid offset values (negative, decimal, non-numeric) return HTTP 400');
    }

    // TEST 25: SQL queries use parameterized values
    {
      const linksDbCode = require('fs').readFileSync(require.resolve('../src/db/links'), 'utf8');
      assert.ok(linksDbCode.includes('WHERE user_id = $1'), 'Parameterized query required for user_id');
      assert.ok(linksDbCode.includes('LIMIT $2'), 'Parameterized query required for LIMIT');
      assert.ok(linksDbCode.includes('OFFSET $3'), 'Parameterized query required for OFFSET');
      console.log('✔ Test 25 Passed: SQL query strictly uses parameterized values ($1, $2, $3)');
    }

    // TEST 26: Database failure returns safe HTTP 500 JSON
    {
      const originalGetUserLinks = linksDb.getUserLinks;

      // Stub getUserLinks to throw connection failure
      linksDb.getUserLinks = async () => {
        throw new Error('connection to server at "localhost" (127.0.0.1) failed');
      };

      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { 'Authorization': authHeaderA }
      });

      linksDb.getUserLinks = originalGetUserLinks;

      assert.strictEqual(res.statusCode, 500);
      assert.deepStrictEqual(res.json, {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }
      });
      assert.strictEqual(res.text.includes('connection to server'), false, 'Database error details must NOT be returned');
      console.log('✔ Test 26 Passed: Database failure returns safe HTTP 500 JSON without exposing SQL details');
    }

    console.log('\nAll Step 6 verification tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    for (const code of createdShortCodes) {
      await linksDb.deleteLinkByShortCode(code);
    }
    if (userA) await usersDb.deleteUserById(userA.user_id);
    if (userB) await usersDb.deleteUserById(userB.user_id);

    if (server) {
      server.close();
    }
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runStep6Tests();
}

module.exports = runStep6Tests;
