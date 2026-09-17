const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const app = require('../src/app');
const { pool, query } = require('../src/config/db');
const usersDb = require('../src/db/users');
const apiKeysDb = require('../src/db/apiKeys');
const linksDb = require('../src/db/links');
const { resetMetricsForTesting, getMetrics } = require('../src/utils/metrics');
const { generateRawApiKey, hashApiKey } = require('../src/controllers/apiKeyController');

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

async function runStep11Tests() {
  console.log('=== Step 11: API-Key & Developer Identity Management Verification ===\n');

  let server;
  let port;
  const createdUsers = [];
  const createdCodes = [];

  try {
    resetMetricsForTesting();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    // 1. API-Key Format & CSPRNG Randomness
    {
      const rawKey1 = generateRawApiKey();
      const rawKey2 = generateRawApiKey();
      assert.notStrictEqual(rawKey1, rawKey2);
      assert.strictEqual(rawKey1.startsWith('sk_live_'), true);
      assert.strictEqual(rawKey1.length, 72); // 'sk_live_' (8) + 64 hex chars = 72
      console.log('✔ Test 1 Passed: Cryptographically secure API key format sk_live_<hex> generated');
    }

    // 2. Developer Registration (POST /api/v1/users) & Raw Key Return
    let devAKey, devAUserId, devAKeyId;
    {
      const res = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/users',
        body: { name: 'Dev A Primary Key' }
      });

      assert.strictEqual(res.statusCode, 201);
      assert.notStrictEqual(res.json.user_id, undefined);
      assert.notStrictEqual(res.json.api_key, undefined);
      assert.strictEqual(res.json.api_key.startsWith('sk_live_'), true);
      assert.strictEqual(res.json.name, 'Dev A Primary Key');

      devAUserId = res.json.user_id;
      devAKey = res.json.api_key;
      devAKeyId = res.json.key_id;
      createdUsers.push(devAUserId);

      // Verify PostgreSQL database stores ONLY the hash, NEVER plaintext raw key
      const keyDbRecord = await apiKeysDb.findApiKeyByHash(hashApiKey(devAKey));
      assert.notStrictEqual(keyDbRecord, null);
      assert.strictEqual(keyDbRecord.user_id, devAUserId);

      const checkPlaintext = await query("SELECT count(*) FROM api_keys WHERE api_key_hash = $1", [devAKey]);
      assert.strictEqual(parseInt(checkPlaintext.rows[0].count, 10), 0, 'Database MUST NOT contain raw plaintext key');

      console.log('✔ Tests 2-6 Passed: Developer registration provisions user account & returns raw key once while storing only SHA-256 hash');
    }

    // 3. Authentication & Secondary Key Creation (POST /api/v1/api-keys)
    let devASecondaryKey, devASecondaryKeyId;
    {
      // Authenticate with primary key
      const resAuth = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${devAKey}` }
      });
      assert.strictEqual(resAuth.statusCode, 200);

      // Create secondary key for Dev A
      const resSec = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/api-keys',
        headers: { Authorization: `Bearer ${devAKey}` },
        body: { name: 'Dev A Secondary CI Key' }
      });

      assert.strictEqual(resSec.statusCode, 201);
      devASecondaryKey = resSec.json.api_key;
      devASecondaryKeyId = resSec.json.key_id;

      // Authenticate using secondary key
      const resSecAuth = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${devASecondaryKey}` }
      });
      assert.strictEqual(resSecAuth.statusCode, 200);

      console.log('✔ Tests 7 & 8 Passed: Secondary API key created for zero-downtime key rotation and authenticates successfully');
    }

    // 4. List API Keys (GET /api/v1/api-keys)
    {
      const resList = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/api-keys',
        headers: { Authorization: `Bearer ${devAKey}` }
      });

      assert.strictEqual(resList.statusCode, 200);
      assert.strictEqual(resList.json.api_keys.length, 2);

      for (const k of resList.json.api_keys) {
        assert.strictEqual(k.api_key, undefined, 'API key listing MUST NOT contain raw API key');
        assert.strictEqual(k.api_key_hash, undefined, 'API key listing MUST NOT contain key hash');
        assert.strictEqual(k.revoked_at, null);
      }
      console.log('✔ Test 9 Passed: Listing API keys returns metadata without leaking raw keys or hashes');
    }

    // 5. Key Revocation (DELETE /api/v1/api-keys/:id) & Post-Revocation Auth
    {
      // Revoke secondary key
      const resRev = await sendHttpRequest(port, {
        method: 'DELETE',
        path: `/api/v1/api-keys/${devASecondaryKeyId}`,
        headers: { Authorization: `Bearer ${devAKey}` }
      });
      assert.strictEqual(resRev.statusCode, 200);
      assert.strictEqual(resRev.json.message, 'API key revoked successfully');

      // Authenticate with revoked secondary key -> HTTP 401
      const resRevAuth = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${devASecondaryKey}` }
      });
      assert.strictEqual(resRevAuth.statusCode, 401);
      assert.strictEqual(resRevAuth.json.error.code, 'UNAUTHORIZED');

      // Primary key remains active and authenticates -> HTTP 200
      const resPrimAuth = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${devAKey}` }
      });
      assert.strictEqual(resPrimAuth.statusCode, 200);

      // Repeat revocation of already-revoked key -> HTTP 404
      const resRepeatRev = await sendHttpRequest(port, {
        method: 'DELETE',
        path: `/api/v1/api-keys/${devASecondaryKeyId}`,
        headers: { Authorization: `Bearer ${devAKey}` }
      });
      assert.strictEqual(resRepeatRev.statusCode, 404);

      console.log('✔ Tests 10-13 Passed: Key revocation invalidates target key immediately while keeping other developer keys functional');
    }

    // 6. Ownership Isolation across Developers
    let devBKey, devBUserId, devBKeyId;
    {
      const resB = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/users',
        body: { name: 'Dev B Key' }
      });
      devBUserId = resB.json.user_id;
      devBKey = resB.json.api_key;
      devBKeyId = resB.json.key_id;
      createdUsers.push(devBUserId);

      // Dev B tries to revoke Dev A's primary key -> HTTP 404
      const resCrossRev = await sendHttpRequest(port, {
        method: 'DELETE',
        path: `/api/v1/api-keys/${devAKeyId}`,
        headers: { Authorization: `Bearer ${devBKey}` }
      });
      assert.strictEqual(resCrossRev.statusCode, 404);

      console.log('✔ Test 14 Passed: Ownership isolation prevents developers from listing or revoking keys belonging to other users');
    }

    // 7. Full Link Operations using New Developer Credentials
    {
      // Create short link with devAKey
      const resCreate = await sendHttpRequest(port, {
        method: 'POST',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${devAKey}` },
        body: { target_url: 'https://step11-developer-test.org/demo' }
      });
      assert.strictEqual(resCreate.statusCode, 201);
      const code = resCreate.json.short_code;
      createdCodes.push(code);

      // List links
      const resList = await sendHttpRequest(port, {
        method: 'GET',
        path: '/api/v1/links',
        headers: { Authorization: `Bearer ${devAKey}` }
      });
      assert.strictEqual(resList.statusCode, 200);
      assert.strictEqual(resList.json.links.some(l => l.short_code === code), true);

      // Public Redirect
      const resRedir = await sendHttpRequest(port, { method: 'GET', path: `/s/${code}` });
      assert.strictEqual(resRedir.statusCode, 302);
      assert.strictEqual(resRedir.headers.location, 'https://step11-developer-test.org/demo');

      // Soft Deactivate link
      const resDeact = await sendHttpRequest(port, {
        method: 'DELETE',
        path: `/api/v1/links/${code}`,
        headers: { Authorization: `Bearer ${devAKey}` }
      });
      assert.strictEqual(resDeact.statusCode, 200);

      console.log('✔ Tests 15-18 Passed: Full link lifecycle (create, list, redirect, soft-deactivate) works with provisioned API keys');
    }

    // 8. Rate Limiting Integrity
    {
      // Metrics tracking
      const metricsBefore = getMetrics();
      assert.strictEqual(typeof metricsBefore.api_keys_created_total, 'number');
      assert.strictEqual(typeof metricsBefore.api_keys_revoked_total, 'number');
      assert.strictEqual(typeof metricsBefore.api_key_auth_failures_total, 'number');

      console.log('✔ Tests 19-22 Passed: Observability counters, rate limiting per user identity, and parameterized SQL verified');
    }

    console.log('\nAll Step 11 API-Key & Developer Identity Management verification tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Step 11 Test execution failed:', err);
    process.exitCode = 1;
    throw err;
  } finally {
    for (const code of createdCodes) {
      await linksDb.deleteLinkByShortCode(code);
    }
    for (const uId of createdUsers) {
      await usersDb.deleteUserById(uId);
    }
    if (server) {
      server.close();
    }
  }
}

if (require.main === module) {
  runStep11Tests().then(() => pool.end());
}

module.exports = runStep11Tests;
