const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const linkService = require('../src/services/linkService');
const { pool } = require('../src/config/db');

// Helper to send HTTP requests to test server
function sendHttpRequest(serverPort, { method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    let payload = null;
    if (body !== null) {
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

async function runStep7Tests() {
  console.log('=== Step 7: Soft-Deactivate a Link Verification ===\n');

  let server = null;
  let serverPort = null;

  // Test User A
  let userA = null;
  const rawKeyA = `test_key_step7_userA_${crypto.randomBytes(16).toString('hex')}`;
  const hashA = crypto.createHash('sha256').update(rawKeyA).digest('hex');
  const authHeaderA = `Bearer ${rawKeyA}`;

  // Test User B
  let userB = null;
  const rawKeyB = `test_key_step7_userB_${crypto.randomBytes(16).toString('hex')}`;
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
        method: 'DELETE',
        path: '/api/v1/links/abc123'
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
        method: 'DELETE',
        path: '/api/v1/links/abc123',
        headers: { 'Authorization': 'Bearer invalid_key_step7' }
      });
      assert.strictEqual(res.statusCode, 401);
      assert.deepStrictEqual(res.json, {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      console.log('✔ Test 2 Passed: Invalid Bearer API key returns HTTP 401');
    }

    // TEST 16: Nonexistent short code returns 404
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'DELETE',
        path: '/api/v1/links/nosuch',
        headers: { 'Authorization': authHeaderA }
      });
      assert.strictEqual(res.statusCode, 404);
      assert.deepStrictEqual(res.json, {
        error: { code: 'NOT_FOUND', message: 'Short link not found' }
      });
      console.log('✔ Test 16 Passed: Nonexistent short code returns HTTP 404');
    }

    // Create Link A (owned by User A) and Link B (owned by User B)
    const linkA = await linkService.createShortLink('https://user-a-target.com/page?query=1', userA.user_id);
    createdShortCodes.push(linkA.short_code);

    const linkB = await linkService.createShortLink('https://user-b-target.com/secret', userB.user_id);
    createdShortCodes.push(linkB.short_code);

    // TEST 14, 15, 17, 20, 21: User A cannot deactivate User B's link & gets 404 without leaking info or logging key
    {
      // Try deactivating Link B using User A's credentials (with attempt to override user_id via query/body)
      const res = await sendHttpRequest(serverPort, {
        method: 'DELETE',
        path: `/api/v1/links/${linkB.short_code}?user_id=${userB.user_id}`,
        headers: { 'Authorization': authHeaderA },
        body: { user_id: userB.user_id }
      });
      assert.strictEqual(res.statusCode, 404, 'User A deactivating User B link must return 404');
      assert.deepStrictEqual(res.json, {
        error: { code: 'NOT_FOUND', message: 'Short link not found' }
      });
      assert.strictEqual(res.text.includes(rawKeyA), false);
      assert.strictEqual(res.text.includes(rawKeyB), false);

      // Verify Link B in DB is STILL ACTIVE
      const dbLinkB = await linksDb.getLinkByShortCode(linkB.short_code);
      assert.strictEqual(dbLinkB.is_active, true, 'Link B must remain active in DB');

      console.log('✔ Tests 14, 15, 17, 20, 21 Passed: Cross-user deactivation blocked; query/body overrides fail with 404');
    }

    // TEST 3-10, 26: Valid owner deactivates Link A -> returns HTTP 200, row exists, only is_active changes to false
    {
      const initialDbRow = await linksDb.getLinkByShortCode(linkA.short_code);
      assert.strictEqual(initialDbRow.is_active, true);
      assert.strictEqual(String(initialDbRow.click_count), '0');

      const res = await sendHttpRequest(serverPort, {
        method: 'DELETE',
        path: `/api/v1/links/${linkA.short_code}`,
        headers: { 'Authorization': authHeaderA }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(res.json, { message: 'Link deactivated' });

      // Physical Delete & Row Integrity Checks
      const dbRowAfter = await linksDb.getLinkByShortCode(linkA.short_code);
      assert.ok(dbRowAfter, 'Database row must STILL EXIST in PostgreSQL (no physical DELETE)');
      assert.strictEqual(dbRowAfter.is_active, false, 'is_active must be updated to false');
      assert.strictEqual(dbRowAfter.short_code, initialDbRow.short_code, 'short_code must remain unchanged');
      assert.strictEqual(dbRowAfter.target_url, initialDbRow.target_url, 'target_url must remain unchanged');
      assert.strictEqual(dbRowAfter.user_id, initialDbRow.user_id, 'user_id must remain unchanged');
      assert.strictEqual(String(dbRowAfter.click_count), String(initialDbRow.click_count), 'click_count must remain unchanged');
      assert.strictEqual(dbRowAfter.created_at.toISOString(), initialDbRow.created_at.toISOString(), 'created_at must remain unchanged');

      console.log('✔ Tests 3-10, 26 Passed: Valid owner soft-deactivates link (HTTP 200); row retained in DB; only is_active=false');
    }

    // TEST 11-12: Redirect GET /s/:code after deactivation returns 410 LINK_INACTIVE and does NOT redirect
    {
      const res = await sendHttpRequest(serverPort, {
        method: 'GET',
        path: `/s/${linkA.short_code}`
      });

      assert.strictEqual(res.statusCode, 410);
      assert.strictEqual(res.headers['location'], undefined, 'Must NOT contain Location redirect header');
      assert.deepStrictEqual(res.json, {
        error: { code: 'LINK_INACTIVE', message: 'Short link is inactive' }
      });
      console.log('✔ Tests 11-12 Passed: GET /s/:code after deactivation returns HTTP 410 LINK_INACTIVE without redirecting');
    }

    // TEST 13: Idempotency (Repeated deactivation on already-inactive link returns HTTP 200)
    {
      const resRepeat = await sendHttpRequest(serverPort, {
        method: 'DELETE',
        path: `/api/v1/links/${linkA.short_code}`,
        headers: { 'Authorization': authHeaderA }
      });

      assert.strictEqual(resRepeat.statusCode, 200, 'Repeated deactivation must return HTTP 200');
      assert.deepStrictEqual(resRepeat.json, { message: 'Link deactivated' });

      const dbRowRepeat = await linksDb.getLinkByShortCode(linkA.short_code);
      assert.strictEqual(dbRowRepeat.is_active, false);

      console.log('✔ Test 13 Passed: Repeated deactivation is idempotent and returns HTTP 200');
    }

    // TEST 18: SQL queries use parameterized values
    {
      const linksDbCode = require('fs').readFileSync(require.resolve('../src/db/links'), 'utf8');
      assert.ok(linksDbCode.includes('WHERE short_code = $1 AND user_id = $2'), 'Parameterized query required for deactivateUserLink');
      console.log('✔ Test 18 Passed: SQL queries strictly use parameterized values ($1, $2)');
    }

    // TEST 19: Database failure returns safe HTTP 500 JSON
    {
      const originalDeactivate = linksDb.deactivateUserLink;

      // Stub deactivateUserLink to throw connection error
      linksDb.deactivateUserLink = async () => {
        throw new Error('connection to server at "localhost" (127.0.0.1) failed');
      };

      const res = await sendHttpRequest(serverPort, {
        method: 'DELETE',
        path: `/api/v1/links/${linkB.short_code}`,
        headers: { 'Authorization': authHeaderB }
      });

      linksDb.deactivateUserLink = originalDeactivate;

      assert.strictEqual(res.statusCode, 500);
      assert.deepStrictEqual(res.json, {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }
      });
      assert.strictEqual(res.text.includes('connection to server'), false, 'SQL details must NOT be exposed');
      console.log('✔ Test 19 Passed: Internal database failure returns safe HTTP 500 JSON without exposing SQL details');
    }

    console.log('\nAll Step 7 verification tests completed successfully!');

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
  runStep7Tests();
}

module.exports = runStep7Tests;
