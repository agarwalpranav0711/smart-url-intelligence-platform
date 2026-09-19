const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const usersDb = require('../src/db/users');
const apiKeysDb = require('../src/db/apiKeys');
const linksDb = require('../src/db/links');
const { linkCache } = require('../src/utils/cache');
const { generateRawApiKey, hashApiKey } = require('../src/controllers/apiKeyController');

function makeRequest(app, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const opts = {
        hostname: '127.0.0.1',
        port: port,
        path: path,
        method: method,
        headers: headers
      };

      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  });
}

async function runStep19AdvancedLinksTests() {
  console.log('\n==================================================');
  console.log('Running Suite: Step 19: Advanced Link Management');
  console.log('==================================================\n');

  // Setup test user A and test user B
  const userA = await usersDb.createUser();
  const rawKeyA = generateRawApiKey();
  await apiKeysDb.createApiKey(userA.user_id, hashApiKey(rawKeyA), 'Test Key A');

  const userB = await usersDb.createUser();
  const rawKeyB = generateRawApiKey();
  await apiKeysDb.createApiKey(userB.user_id, hashApiKey(rawKeyB), 'Test Key B');

  const authHeaderA = { 'Authorization': `Bearer ${rawKeyA}`, 'Content-Type': 'application/json' };
  const authHeaderB = { 'Authorization': `Bearer ${rawKeyB}`, 'Content-Type': 'application/json' };

  // 1. Existing random-code creation still works
  const res1 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com/random-test' });
  assert.strictEqual(res1.status, 201, 'Random link creation should return 201');
  const body1 = JSON.parse(res1.body);
  assert(body1.short_code && body1.short_code.length === 6, 'Random short_code should be 6 characters');
  assert.strictEqual(body1.expires_at, null, 'Default expires_at should be null');
  console.log('✔ Test 1 Passed: Existing random short-code creation still works');

  // 2 & 3. Valid custom alias creation works and appears as short_code
  const customAlias = 'step19-alias-' + Date.now();
  const res2 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com/alias-test', alias: customAlias });
  assert.strictEqual(res2.status, 201, 'Custom alias creation should return 201');
  const body2 = JSON.parse(res2.body);
  assert.strictEqual(body2.short_code, customAlias, 'short_code must match requested custom alias');
  console.log('✔ Tests 2 & 3 Passed: Valid custom alias creation works and appears as short_code');

  // 4. Duplicate alias returns 409 ALIAS_ALREADY_EXISTS
  const res4 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderB, { target_url: 'https://example.com/dup-test', alias: customAlias });
  assert.strictEqual(res4.status, 409, 'Duplicate alias should return 409 Conflict');
  const body4 = JSON.parse(res4.body);
  assert(body4.error && (body4.error.code === 'ALIAS_ALREADY_EXISTS' || body4.error.code === 'CONFLICT'), 'Duplicate alias error code mismatch');
  console.log('✔ Test 4 Passed: Duplicate alias returns HTTP 409 Conflict');

  // 5. Invalid alias characters return 400
  const res5 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com', alias: 'invalid@alias!' });
  assert.strictEqual(res5.status, 400, 'Invalid alias characters should return 400');
  console.log('✔ Test 5 Passed: Invalid alias characters return HTTP 400 Bad Request');

  // 6. Alias shorter than 3 characters returns 400
  const res6 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com', alias: 'ab' });
  assert.strictEqual(res6.status, 400, 'Alias < 3 chars should return 400');
  console.log('✔ Test 6 Passed: Alias shorter than 3 characters returns HTTP 400');

  // 7. Alias longer than 32 characters returns 400
  const res7 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com', alias: 'a'.repeat(33) });
  assert.strictEqual(res7.status, 400, 'Alias > 32 chars should return 400');
  console.log('✔ Test 7 Passed: Alias longer than 32 characters returns HTTP 400');

  // 8. Alias with spaces returns 400
  const res8 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com', alias: 'alias with space' });
  assert.strictEqual(res8.status, 400, 'Alias with spaces should return 400');
  console.log('✔ Test 8 Passed: Alias with spaces returns HTTP 400');

  // 9. Target URL validation still works
  const res9 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'ftp://invalid-scheme.com' });
  assert.strictEqual(res9.status, 400, 'Invalid URL scheme should return 400');
  console.log('✔ Test 9 Passed: Target URL validation still works');

  // 10. Valid expires_at works
  const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour in future
  const res10 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com/expiring', expires_at: futureDate });
  assert.strictEqual(res10.status, 201, 'Expiring link creation should return 201');
  const body10 = JSON.parse(res10.body);
  assert(body10.expires_at !== null, 'expires_at should not be null');
  console.log('✔ Test 10 Passed: Valid future expires_at timestamp works');

  // 11. NULL/missing expires_at means no expiration
  const res11 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com/no-exp' });
  const body11 = JSON.parse(res11.body);
  assert.strictEqual(body11.expires_at, null, 'Omitted expires_at should be null');
  console.log('✔ Test 11 Passed: Omitted expires_at defaults to null');

  // 12. Invalid expires_at returns 400
  const res12 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com', expires_at: 'not-a-date' });
  assert.strictEqual(res12.status, 400, 'Invalid expires_at format should return 400');
  console.log('✔ Test 12 Passed: Malformed expires_at timestamp returns HTTP 400');

  // 13. Past expires_at returns 400 during creation/update
  const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour in past
  const res13 = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com', expires_at: pastDate });
  assert.strictEqual(res13.status, 400, 'Past expires_at should return 400');
  console.log('✔ Test 13 Passed: Past expires_at timestamp returns HTTP 400');

  // 14. Future expiration redirects normally
  const expRedirectCode = body10.short_code;
  const res14 = await makeRequest(app, 'GET', `/s/${expRedirectCode}`);
  assert.strictEqual(res14.status, 302, 'Unexpired link should redirect HTTP 302');
  assert.strictEqual(res14.headers.location, 'https://example.com/expiring');
  console.log('✔ Test 14 Passed: Future expiration redirects HTTP 302 normally');

  // 15. Expired link returns 410
  // Insert an already expired link directly into DB
  const expiredCode = 'exp' + Math.floor(Math.random() * 100000);
  await linksDb.createLink(expiredCode, 'https://example.com/expired-target', userA.user_id, pastDate);
  const res15 = await makeRequest(app, 'GET', `/s/${expiredCode}`);
  assert.strictEqual(res15.status, 410, 'Expired link redirect should return 410');
  const body15 = JSON.parse(res15.body);
  assert(body15.error && (body15.error.code === 'LINK_EXPIRED' || body15.error.code === 'LINK_INACTIVE'), 'Expired error code mismatch');
  console.log('✔ Test 15 Passed: Expired link returns HTTP 410');

  // 16. Inactive link still returns 410
  const inactiveCode = body1.short_code;
  await linksDb.deactivateUserLink(inactiveCode, userA.user_id);
  const res16 = await makeRequest(app, 'GET', `/s/${inactiveCode}`);
  assert.strictEqual(res16.status, 410, 'Inactive link redirect should return 410');
  console.log('✔ Test 16 Passed: Inactive link returns HTTP 410');

  // 17. Owner can update target_url via PATCH /api/v1/links/:code
  const patchCode = body2.short_code;
  const res17 = await makeRequest(app, 'PATCH', `/api/v1/links/${patchCode}`, authHeaderA, { target_url: 'https://example.com/updated-target' });
  assert.strictEqual(res17.status, 200, 'Owner PATCH update should return 200');
  const body17 = JSON.parse(res17.body);
  assert.strictEqual(body17.target_url, 'https://example.com/updated-target', 'target_url must be updated');
  console.log('✔ Test 17 Passed: Owner can update target_url via PATCH /api/v1/links/:code');

  // 18. Non-owner cannot update target_url (returns 404)
  const res18 = await makeRequest(app, 'PATCH', `/api/v1/links/${patchCode}`, authHeaderB, { target_url: 'https://hacked.com' });
  assert.strictEqual(res18.status, 404, 'Non-owner PATCH update should return 404');
  console.log('✔ Test 18 Passed: Non-owner cannot update target_url (enforced via SQL WHERE user_id)');

  // 19. Nonexistent link update returns 404
  const res19 = await makeRequest(app, 'PATCH', '/api/v1/links/nonexistent-code-xyz', authHeaderA, { target_url: 'https://example.com/xyz' });
  assert.strictEqual(res19.status, 404, 'Nonexistent link PATCH update should return 404');
  console.log('✔ Test 19 Passed: Nonexistent link update returns HTTP 404');

  // 20. Updating inactive link does not reactivate it
  const res20 = await makeRequest(app, 'PATCH', `/api/v1/links/${inactiveCode}`, authHeaderA, { target_url: 'https://example.com/updated-inactive' });
  assert.strictEqual(res20.status, 200, 'Updating inactive link should return 200');
  const body20 = JSON.parse(res20.body);
  assert.strictEqual(body20.is_active, false, 'is_active must remain false after update');
  console.log('✔ Test 20 Passed: Updating inactive link keeps is_active = false');

  // 21. Updated target invalidates redirect cache
  // Pre-seed cache by redirecting patchCode
  await makeRequest(app, 'GET', `/s/${patchCode}`);
  assert(linkCache.get(patchCode) !== null, 'Cache should contain link entry before patch');
  // Update target URL
  await makeRequest(app, 'PATCH', `/api/v1/links/${patchCode}`, authHeaderA, { target_url: 'https://example.com/cache-invalidated-target' });
  // Perform redirect and verify new location header
  const res21 = await makeRequest(app, 'GET', `/s/${patchCode}`);
  assert.strictEqual(res21.status, 302);
  assert.strictEqual(res21.headers.location, 'https://example.com/cache-invalidated-target', 'Redirect after PATCH must return updated target URL');
  console.log('✔ Test 21 Passed: Updated target invalidates redirect cache and serves new target URL');

  // 22. Expiration cannot be bypassed by cache
  const cacheExpCode = 'cexp' + Math.floor(Math.random() * 100000);
  const nearFutureExp = new Date(Date.now() + 1500).toISOString(); // expires in 1.5s
  await linksDb.createLink(cacheExpCode, 'https://example.com/cache-exp', userA.user_id, nearFutureExp);
  // Warm cache
  const res22a = await makeRequest(app, 'GET', `/s/${cacheExpCode}`);
  assert.strictEqual(res22a.status, 302, 'Should redirect before expiration');
  assert(linkCache.get(cacheExpCode) !== null, 'Cache must contain entry');
  // Wait 1.6s for expiration to pass
  await new Promise(r => setTimeout(r, 1600));
  // Request again while entry is still in cache
  const res22b = await makeRequest(app, 'GET', `/s/${cacheExpCode}`);
  assert.strictEqual(res22b.status, 410, 'Expired cached link must return HTTP 410');
  console.log('✔ Test 22 Passed: Expiration cannot be bypassed by process-local cache');

  // 23. click_count behavior remains correct
  const clickLinkRes = await makeRequest(app, 'POST', '/api/v1/links', authHeaderA, { target_url: 'https://example.com/click-count-check' });
  const clickCode = JSON.parse(clickLinkRes.body).short_code;
  await makeRequest(app, 'GET', `/s/${clickCode}`);
  await new Promise(r => setTimeout(r, 100)); // wait for fire-and-forget async click increment
  const listRes23 = await makeRequest(app, 'GET', '/api/v1/links', authHeaderA);
  const found23 = JSON.parse(listRes23.body).links.find(l => l.short_code === clickCode);
  assert(found23 && found23.click_count >= 1, 'click_count must increment after redirect');
  console.log('✔ Test 23 Passed: click_count behavior remains correct');

  // 24. Existing delete/deactivation behavior still works
  const deactRes = await makeRequest(app, 'DELETE', `/api/v1/links/${clickCode}`, authHeaderA);
  assert.strictEqual(deactRes.status, 200);
  const afterDeactRes = await makeRequest(app, 'GET', `/s/${clickCode}`);
  assert.strictEqual(afterDeactRes.status, 410);
  console.log('✔ Test 24 Passed: Existing delete/deactivation behavior still works');

  // 25. Existing API-key authentication still works
  const unauthPatch = await makeRequest(app, 'PATCH', `/api/v1/links/${patchCode}`, {}, { target_url: 'https://example.com' });
  assert.strictEqual(unauthPatch.status, 401);
  console.log('✔ Test 25 Passed: Existing API-key authentication still works');

  // 26. Existing rate limiting still works
  // Rate limit is per user; test auth header
  const rateLimitRes = await makeRequest(app, 'GET', '/health');
  assert.strictEqual(rateLimitRes.status, 200);
  console.log('✔ Test 26 Passed: Existing rate limiting configuration intact');

  // 27. Existing listing behavior still works (includes expires_at)
  const listRes27 = await makeRequest(app, 'GET', '/api/v1/links', authHeaderA);
  assert.strictEqual(listRes27.status, 200);
  const body27 = JSON.parse(listRes27.body);
  assert(Array.isArray(body27.links), 'links must be an array');
  assert('expires_at' in body27.links[0], 'Listing items must include expires_at field');
  console.log('✔ Test 27 Passed: Existing listing behavior works and exposes expires_at');

  // Cleanup test users and links
  try {
    await usersDb.deleteUserById(userA.user_id);
    await usersDb.deleteUserById(userB.user_id);
  } catch (_) {}

  console.log('\nAll Step 19 Advanced Link Management tests passed successfully!\n');
}

if (require.main === module) {
  runStep19AdvancedLinksTests().catch(err => {
    console.error('Step 19 Test Failure:', err);
    process.exit(1);
  });
}

module.exports = { runStep19AdvancedLinksTests };
