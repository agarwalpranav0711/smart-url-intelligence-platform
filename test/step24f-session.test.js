const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const usersDb = require('../src/db/users');
const apiKeysDb = require('../src/db/apiKeys');
const sessionsDb = require('../src/db/sessions');
const linksDb = require('../src/db/links');

let server;
let baseUrl;

function parseCookies(res) {
  const setCookieHeaders = res.headers['set-cookie'];
  if (!setCookieHeaders) return {};
  const cookies = {};
  setCookieHeaders.forEach(str => {
    const parts = str.split(';')[0].split('=');
    if (parts.length === 2) {
      cookies[parts[0].trim()] = parts[1].trim();
    }
  });
  return cookies;
}

function request(method, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookies: parseCookies(res),
          body: json || body
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STEP 24F: WEB SESSION AUTHENTICATION & SECURITY TESTS ===');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let userA, rawKeyA, keyRecordA;
  let userB, rawKeyB;

  try {
    // 0. Setup test users and API keys
    userA = await usersDb.createUser();
    rawKeyA = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const hashA = crypto.createHash('sha256').update(rawKeyA).digest('hex');
    keyRecordA = await apiKeysDb.createApiKey(userA.user_id, hashA, 'Test Key A');

    userB = await usersDb.createUser();
    rawKeyB = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const hashB = crypto.createHash('sha256').update(rawKeyB).digest('hex');
    await apiKeysDb.createApiKey(userB.user_id, hashB, 'Test Key B');

    // TEST 1: Valid Session Creation
    {
      const res = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawKeyA }
      });
      assert.strictEqual(res.status, 201, 'Valid session creation must return 201 Created');
      assert.strictEqual(res.body.user_id, userA.user_id, 'Session response must include matching user_id');
      assert.ok(res.body.csrf_token, 'Session response must include csrf_token');
      assert.ok(res.body.expires_at, 'Session response must include expires_at');
      assert.ok(res.cookies.sid, 'Response must include sid cookie');

      const setCookieStr = res.headers['set-cookie'] ? res.headers['set-cookie'][0] : '';
      assert.ok(setCookieStr.toLowerCase().includes('httponly'), 'Cookie must specify HttpOnly');
      assert.ok(setCookieStr.toLowerCase().includes('samesite=lax'), 'Cookie must specify SameSite=Lax');
      console.log('✔ TEST 1 PASSED: Valid session creation returns 201 with sid cookie & CSRF token');
    }

    // TEST 2: Invalid API Key Session Creation
    {
      const res = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: 'sk_live_invalid_key_12345' }
      });
      assert.strictEqual(res.status, 401, 'Invalid API key must return 401 Unauthorized');
      assert.strictEqual(res.cookies.sid, undefined, 'Invalid key must not set sid cookie');
      console.log('✔ TEST 2 PASSED: Invalid API key returns 401');
    }

    // TEST 3: Revoked API Key Session Creation
    {
      const rawRevokedKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
      const revokedHash = crypto.createHash('sha256').update(rawRevokedKey).digest('hex');
      const revokedKeyRecord = await apiKeysDb.createApiKey(userA.user_id, revokedHash, 'Revoked Key');
      await apiKeysDb.revokeUserApiKey(revokedKeyRecord.key_id, userA.user_id);

      const res = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawRevokedKey }
      });
      assert.strictEqual(res.status, 401, 'Revoked API key must return 401 Unauthorized');
      console.log('✔ TEST 3 PASSED: Revoked API key returns 401');
    }

    // TEST 4: Session Lookup (GET /api/v1/auth/session)
    let activeSid, activeCsrf;
    {
      const loginRes = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawKeyA }
      });
      activeSid = loginRes.cookies.sid;
      activeCsrf = loginRes.body.csrf_token;

      const sessionRes = await request('GET', '/api/v1/auth/session', {
        headers: { Cookie: `sid=${activeSid}` }
      });
      assert.strictEqual(sessionRes.status, 200, 'Valid session lookup returns 200 OK');
      assert.strictEqual(sessionRes.body.authenticated, true);
      assert.strictEqual(sessionRes.body.user_id, userA.user_id);
      assert.ok(sessionRes.body.csrf_token, 'Session lookup returns rotated csrf_token');
      // Update active CSRF to rotated token
      activeCsrf = sessionRes.body.csrf_token;
      console.log('✔ TEST 4 PASSED: Session lookup returns 200 authenticated state with rotated CSRF token');
    }

    // TEST 5: Expired Session
    {
      const expRawSid = `sess_${crypto.randomBytes(32).toString('hex')}`;
      const expSidHash = crypto.createHash('sha256').update(expRawSid).digest('hex');
      const expCsrfHash = crypto.createHash('sha256').update('csrf_dummy').digest('hex');
      await sessionsDb.createSession({
        sessionIdHash: expSidHash,
        userId: userA.user_id,
        csrfTokenHash: expCsrfHash,
        expiresAt: new Date(Date.now() - 1000) // Expired 1 second ago
      });

      const res = await request('GET', '/api/v1/auth/session', {
        headers: { Cookie: `sid=${expRawSid}` }
      });
      assert.strictEqual(res.status, 401, 'Expired session must return 401');
      assert.strictEqual(res.body.authenticated, false);
      console.log('✔ TEST 5 PASSED: Expired session returns 401');
    }

    // TEST 6: Revoked Session
    {
      const revRawSid = `sess_${crypto.randomBytes(32).toString('hex')}`;
      const revSidHash = crypto.createHash('sha256').update(revRawSid).digest('hex');
      const revCsrfHash = crypto.createHash('sha256').update('csrf_dummy').digest('hex');
      await sessionsDb.createSession({
        sessionIdHash: revSidHash,
        userId: userA.user_id,
        csrfTokenHash: revCsrfHash,
        expiresAt: new Date(Date.now() + 3600000)
      });
      await sessionsDb.revokeSession(revSidHash);

      const res = await request('GET', '/api/v1/auth/session', {
        headers: { Cookie: `sid=${revRawSid}` }
      });
      assert.strictEqual(res.status, 401, 'Revoked session must return 401');
      console.log('✔ TEST 6 PASSED: Revoked session returns 401');
    }

    // TEST 7: Logout (DELETE /api/v1/auth/session)
    {
      const logoutRes = await request('DELETE', '/api/v1/auth/session', {
        headers: { Cookie: `sid=${activeSid}` }
      });
      assert.strictEqual(logoutRes.status, 200, 'Logout returns 200 OK');

      // Verify session is revoked in DB
      const checkRes = await request('GET', '/api/v1/auth/session', {
        headers: { Cookie: `sid=${activeSid}` }
      });
      assert.strictEqual(checkRes.status, 401, 'Post-logout session lookup returns 401');
      console.log('✔ TEST 7 PASSED: Logout revokes session and returns 200');
    }

    // TEST 8: Session Authenticated Mutation with Valid CSRF Token
    {
      const loginRes = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawKeyA }
      });
      const sid = loginRes.cookies.sid;
      const csrf = loginRes.body.csrf_token;

      const linkRes = await request('POST', '/api/v1/links', {
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sid=${sid}`,
          'X-CSRF-Token': csrf
        },
        body: { target_url: 'https://example.com/session-created-link' }
      });
      assert.strictEqual(linkRes.status, 201, 'Session mutation with valid CSRF returns 201 Created');
      assert.ok(linkRes.body.short_code);
      console.log('✔ TEST 8 PASSED: Protected mutation succeeds via session cookie + X-CSRF-Token');
    }

    // TEST 9: Session Mutation Missing CSRF Token (HTTP 403)
    {
      const loginRes = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawKeyA }
      });
      const sid = loginRes.cookies.sid;

      const linkRes = await request('POST', '/api/v1/links', {
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sid=${sid}`
        },
        body: { target_url: 'https://example.com/nocsrf' }
      });
      assert.strictEqual(linkRes.status, 403, 'Missing CSRF token must return 403 Forbidden');
      assert.strictEqual(linkRes.body.error.code, 'CSRF_VALIDATION_FAILED');
      console.log('✔ TEST 9 PASSED: Session mutation missing X-CSRF-Token returns 403 CSRF_VALIDATION_FAILED');
    }

    // TEST 10: Session Mutation Invalid CSRF Token (HTTP 403)
    {
      const loginRes = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawKeyA }
      });
      const sid = loginRes.cookies.sid;

      const linkRes = await request('POST', '/api/v1/links', {
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sid=${sid}`,
          'X-CSRF-Token': 'csrf_invalid_token_99999'
        },
        body: { target_url: 'https://example.com/badcsrf' }
      });
      assert.strictEqual(linkRes.status, 403, 'Invalid CSRF token must return 403 Forbidden');
      assert.strictEqual(linkRes.body.error.code, 'CSRF_VALIDATION_FAILED');
      console.log('✔ TEST 10 PASSED: Session mutation with invalid X-CSRF-Token returns 403 CSRF_VALIDATION_FAILED');
    }

    // TEST 11: Bearer API-Key Authentication Still Works Without Session / CSRF
    {
      const linkRes = await request('POST', '/api/v1/links', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rawKeyB}`
        },
        body: { target_url: 'https://example.com/bearer-link' }
      });
      assert.strictEqual(linkRes.status, 201, 'Bearer API-key auth must succeed without CSRF token');
      assert.ok(linkRes.body.short_code);
      console.log('✔ TEST 11 PASSED: Bearer API-key authentication remains fully functional');
    }

    // TEST 12: Invalid Request Origin returns 403
    {
      const loginRes = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawKeyA }
      });
      const sid = loginRes.cookies.sid;
      const csrf = loginRes.body.csrf_token;

      const linkRes = await request('POST', '/api/v1/links', {
        headers: {
          'Content-Type': 'application/json',
          Cookie: `sid=${sid}`,
          'X-CSRF-Token': csrf,
          Origin: 'http://malicious-site.com'
        },
        body: { target_url: 'https://example.com/untrusted-origin' }
      });
      assert.strictEqual(linkRes.status, 403, 'Untrusted origin must return 403 Forbidden');
      console.log('✔ TEST 12 PASSED: Session mutation from untrusted Origin returns 403');
    }

    // TEST 13: Revoking an API Key does NOT invalidate active browser session
    {
      const loginRes = await request('POST', '/api/v1/auth/session', {
        headers: { 'Content-Type': 'application/json' },
        body: { api_key: rawKeyA }
      });
      const sid = loginRes.cookies.sid;

      // Revoke the key
      await apiKeysDb.revokeUserApiKey(keyRecordA.key_id, userA.user_id);

      // Session lookup remains valid
      const sessionRes = await request('GET', '/api/v1/auth/session', {
        headers: { Cookie: `sid=${sid}` }
      });
      assert.strictEqual(sessionRes.status, 200, 'Browser session must survive API-key revocation');
      assert.strictEqual(sessionRes.body.authenticated, true);
      console.log('✔ TEST 13 PASSED: Browser session remains authenticated after API key revocation');
    }

    console.log('=== ALL STEP 24F SESSION TESTS PASSED SUCCESSFULLY ===');
  } finally {
    if (userA) await usersDb.deleteUserById(userA.user_id);
    if (userB) await usersDb.deleteUserById(userB.user_id);
    if (server) server.close();
  }
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('FAILED STEP 24F SESSION TESTS:', err);
    process.exit(1);
  });
}

module.exports = runTests;
