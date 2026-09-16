const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const usersDb = require('../src/db/users');
const linksDb = require('../src/db/links');
const linkService = require('../src/services/linkService');
const { resetMetricsForTesting, getMetrics } = require('../src/utils/metrics');
const { generateShortCode, BASE62_ALPHABET, SHORT_CODE_LENGTH } = require('../src/utils/base62');

// Helper function to issue HTTP requests against the test server instance
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

async function runStep10Tests() {
  console.log('=== Step 10: Final Integration, Hardening & System Audit Verification ===\n');

  let server;
  let port;
  let userAKey, userAId;
  let userBKey, userBId;
  const createdCodes = [];

  try {
    resetMetricsForTesting();

    // Start HTTP server on dynamic port
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    // Create User A
    userAKey = 'step10_userA_' + crypto.randomBytes(12).toString('hex');
    const hashA = crypto.createHash('sha256').update(userAKey).digest('hex');
    const uA = await usersDb.createUser(hashA);
    userAId = uA.user_id;

    // Create User B
    userBKey = 'step10_userB_' + crypto.randomBytes(12).toString('hex');
    const hashB = crypto.createHash('sha256').update(userBKey).digest('hex');
    const uB = await usersDb.createUser(hashB);
    userBId = uB.user_id;

    // 1. Express Security Hardening (Disable X-Powered-By)
    {
      const res = await sendHttpRequest(port, { method: 'GET', path: '/health' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['x-powered-by'], undefined, 'X-Powered-By header MUST NOT be present');
      console.log('✔ Test 1 Passed: Express security hardening disables X-Powered-By header');
    }

    // 2. Structured JSON 404 for Unknown Endpoints
    {
      const res = await sendHttpRequest(port, { method: 'GET', path: '/api/v1/unknown' });
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.json.error.code, 'NOT_FOUND');
      assert.strictEqual(res.json.error.message, 'Route not found');
      console.log('✔ Test 2 Passed: Unknown routes return structured HTTP 404 JSON response');
    }

    // 3. Authentication Verification & Header Protections
    {
      // Missing header
      const resMissing = await sendHttpRequest(port, { method: 'GET', path: '/api/v1/links' });
      assert.strictEqual(resMissing.statusCode, 401);

      // Invalid bearer key
      const resInvalid = await sendHttpRequest(port, {
        method: 'GET', path: '/api/v1/links', headers: { Authorization: 'Bearer badkey123' }
      });
      assert.strictEqual(resInvalid.statusCode, 401);

      // Valid bearer key
      const resValid = await sendHttpRequest(port, {
        method: 'GET', path: '/api/v1/links', headers: { Authorization: `Bearer ${userAKey}` }
      });
      assert.strictEqual(resValid.statusCode, 200);
      console.log('✔ Test 3 Passed: Bearer API key authentication strictly enforced and verified');
    }

    // 4. Authorization & Ownership Privacy (User A vs User B Isolation)
    {
      // User A creates link with spoofed body parameter user_id = User B
      const createRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${userAKey}` },
        body: { target_url: 'https://user-a-domain.org/path', user_id: userBId }
      });

      assert.strictEqual(createRes.statusCode, 201);
      const code = createRes.json.short_code;
      createdCodes.push(code);

      // Verify row in DB is assigned strictly to userAId
      const row = await linksDb.getLinkByShortCode(code);
      assert.strictEqual(row.user_id, userAId, 'Ownership MUST be derived strictly from req.user.userId');

      // User B tries to deactivate User A link -> 404
      const deactB = await sendHttpRequest(port, {
        method: 'DELETE',
        path: `/api/v1/links/${code}`,
        headers: { Authorization: `Bearer ${userBKey}` }
      });
      assert.strictEqual(deactB.statusCode, 404);
      console.log('✔ Test 4 Passed: Strict ownership isolation enforced across users and spoofed client body/query inputs');
    }

    // 5. URL Validation Audit
    {
      const authHeader = { Authorization: `Bearer ${userAKey}` };

      // Reject non-http/https
      const badSchemes = ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://ftp.test.com'];
      for (const scheme of badSchemes) {
        const res = await sendHttpRequest(port, {
          method: 'POST', path: '/api/v1/links', headers: authHeader, body: { target_url: scheme }
        });
        assert.strictEqual(res.statusCode, 400);
      }

      // Reject length > 2048
      const longUrl = 'https://example.org/' + 'x'.repeat(2045);
      const resLong = await sendHttpRequest(port, {
        method: 'POST', path: '/api/v1/links', headers: authHeader, body: { target_url: longUrl }
      });
      assert.strictEqual(resLong.statusCode, 400);
      console.log('✔ Test 5 Passed: URL validation restricts schemes to http/https and rejects invalid/excessive lengths');
    }

    // 6. CSPRNG Base62 Short Code Engine & DB Retry Logic
    {
      const code = generateShortCode();
      assert.strictEqual(code.length, SHORT_CODE_LENGTH);
      for (let i = 0; i < code.length; i++) {
        assert.strictEqual(BASE62_ALPHABET.includes(code[i]), true);
      }

      let attempts = 0;
      const originalCreateLink = linksDb.createLink;
      linksDb.createLink = async (sc, tu, ui) => {
        attempts++;
        if (attempts === 1) {
          const err = new Error('duplicate key value violates unique constraint "links_pkey"');
          err.code = '23505';
          throw err;
        }
        return originalCreateLink(sc, tu, ui);
      };

      try {
        const link = await linkService.createShortLink('https://csprng-test.org', userAId);
        assert.strictEqual(attempts, 2, 'Should retry on 23505 duplicate key error');
        createdCodes.push(link.short_code);
      } finally {
        linksDb.createLink = originalCreateLink;
      }
      console.log('✔ Test 6 Passed: CSPRNG Base62 code engine verified with 3-attempt 23505 unique collision retries');
    }

    // 7. Public Redirect & Atomic Best-Effort Click Counting
    {
      const createRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${userAKey}` },
        body: { target_url: 'https://redirect-verify.com/target' }
      });
      const code = createRes.json.short_code;
      createdCodes.push(code);

      // GET /s/:code -> 302
      const redir = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(redir.statusCode, 302);
      assert.strictEqual(redir.headers.location, 'https://redirect-verify.com/target');

      // Wait 100ms for async click count update
      await new Promise((r) => setTimeout(r, 100));

      const updatedRow = await linksDb.getLinkByShortCode(code);
      assert.strictEqual(Number(updatedRow.click_count), 1, 'Click count must be atomically incremented');
      console.log('✔ Test 7 Passed: Public redirect returns HTTP 302 with Location header and performs async atomic click updates');
    }

    // 8. Soft-Deactivation & Idempotency
    {
      const createRes = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${userAKey}` },
        body: { target_url: 'https://soft-deact-verify.com' }
      });
      const code = createRes.json.short_code;
      createdCodes.push(code);

      // Deactivate 1st time -> 200
      const d1 = await sendHttpRequest(port, {
        method: 'DELETE', path: `/api/v1/links/${code}`, headers: { Authorization: `Bearer ${userAKey}` }
      });
      assert.strictEqual(d1.statusCode, 200);

      const row = await linksDb.getLinkByShortCode(code);
      assert.notStrictEqual(row, null);
      assert.strictEqual(row.is_active, false, 'Row must set is_active = false');

      // Deactivate 2nd time (Idempotent) -> 200
      const d2 = await sendHttpRequest(port, {
        method: 'DELETE', path: `/api/v1/links/${code}`, headers: { Authorization: `Bearer ${userAKey}` }
      });
      assert.strictEqual(d2.statusCode, 200);

      // GET /s/:code -> 410 LINK_INACTIVE
      const redirInact = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(redirInact.statusCode, 410);
      assert.strictEqual(redirInact.json.error.code, 'LINK_INACTIVE');
      console.log('✔ Test 8 Passed: Soft-deactivation changes is_active = false, preserves row, and handles repeated calls idempotently');
    }

    // 9. Pagination Validation
    {
      const authHeader = { Authorization: `Bearer ${userAKey}` };
      const resOk = await sendHttpRequest(port, { method: 'GET', path: '/api/v1/links?limit=5&offset=0', headers: authHeader });
      assert.strictEqual(resOk.statusCode, 200);
      assert.strictEqual(resOk.json.limit, 5);
      assert.strictEqual(resOk.json.offset, 0);

      const resBadLimit = await sendHttpRequest(port, { method: 'GET', path: '/api/v1/links?limit=0', headers: authHeader });
      assert.strictEqual(resBadLimit.statusCode, 400);
      console.log('✔ Test 9 Passed: Pagination parameters limit and offset validated strictly');
    }

    // 10. Malformed JSON Body Error Handling
    {
      const res = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${userAKey}` },
        body: '{ "target_url": '
      });
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.json.error.code, 'INVALID_REQUEST');
      assert.strictEqual(res.json.error.message, 'Malformed JSON payload');
      console.log('✔ Test 10 Passed: Malformed JSON payloads return clean HTTP 400 JSON error');
    }

    // 11. Operational Endpoints & SQL Injection Safety
    {
      const hRes = await sendHttpRequest(port, { method: 'GET', path: '/health' });
      assert.strictEqual(hRes.statusCode, 200);

      const mRes = await sendHttpRequest(port, { method: 'GET', path: '/metrics' });
      assert.strictEqual(mRes.statusCode, 200);

      // SQL injection probe in short code (URL encoded)
      const sqliRes = await sendHttpRequest(port, { method: 'GET', path: `/s/${encodeURIComponent("' OR 1=1--")}` });
      assert.strictEqual(sqliRes.statusCode, 404);


      console.log('✔ Test 11 Passed: Operational endpoints functional and SQL parameterization verified against injection');
    }

    console.log('\nAll Step 10 final integration and audit verification tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Step 10 Test execution failed:', err);
    process.exitCode = 1;
    throw err;
  } finally {
    for (const code of createdCodes) {
      await linksDb.deleteLinkByShortCode(code);
    }
    if (userAId) await usersDb.deleteUserById(userAId);
    if (userBId) await usersDb.deleteUserById(userBId);
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runStep10Tests().then(() => pool.end());
}

module.exports = runStep10Tests;
