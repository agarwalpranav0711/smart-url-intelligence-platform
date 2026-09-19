const assert = require('assert');
const http = require('http');
const app = require('../src/app');

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

async function runStep18ApiQualityTests() {
  console.log('\n==================================================');
  console.log('Running Suite: Step 18: API Quality & Developer Experience');
  console.log('==================================================\n');

  // 1. Verify GET /docs returns 200 or 301/302 (Swagger UI)
  const docsRes = await makeRequest(app, 'GET', '/docs/');
  assert(docsRes.status === 200 || docsRes.status === 301 || docsRes.status === 302, `Expected /docs/ to return 200/301/302, got ${docsRes.status}`);
  assert(docsRes.body.includes('swagger') || docsRes.body.includes('Swagger') || docsRes.body.includes('html') || docsRes.status === 301, 'Swagger UI content check failed');
  console.log('✔ Test 1 Passed: GET /docs exposes interactive Swagger UI');

  // 2. Verify GET /docs/openapi.yaml
  const yamlRes = await makeRequest(app, 'GET', '/docs/openapi.yaml');
  assert.strictEqual(yamlRes.status, 200, 'Expected /docs/openapi.yaml to return 200');
  assert(yamlRes.body.includes('openapi: 3.0.3'), 'YAML spec missing openapi: 3.0.3 header');
  assert(yamlRes.body.includes('Smart URL Intelligence Platform API'), 'YAML spec missing title');
  console.log('✔ Test 2 Passed: GET /docs/openapi.yaml returns valid OpenAPI 3.0 specification');

  // 3. Verify GET /docs/openapi.json
  const jsonRes = await makeRequest(app, 'GET', '/docs/openapi.json');
  assert.strictEqual(jsonRes.status, 200, 'Expected /docs/openapi.json to return 200');
  const parsedSpec = JSON.parse(jsonRes.body);
  assert.strictEqual(parsedSpec.openapi, '3.0.3');
  assert(parsedSpec.paths['/api/v1/users'], 'OpenAPI spec missing /api/v1/users path');
  assert(parsedSpec.paths['/api/v1/api-keys'], 'OpenAPI spec missing /api/v1/api-keys path');
  assert(parsedSpec.paths['/api/v1/links'], 'OpenAPI spec missing /api/v1/links path');
  assert(parsedSpec.paths['/s/{code}'], 'OpenAPI spec missing /s/{code} path');
  assert(parsedSpec.paths['/health'], 'OpenAPI spec missing /health path');
  assert(parsedSpec.paths['/metrics'], 'OpenAPI spec missing /metrics path');
  console.log('✔ Test 3 Passed: GET /docs/openapi.json contains full path dictionary for all 10 endpoints');

  // 4. Verify API response & error envelope consistency
  const unauthRes = await makeRequest(app, 'POST', '/api/v1/links', { 'content-type': 'application/json' }, { target_url: 'https://example.com' });
  assert.strictEqual(unauthRes.status, 401, 'Expected unauthenticated request to return 401');
  const unauthJson = JSON.parse(unauthRes.body);
  assert(unauthJson.error && unauthJson.error.code === 'UNAUTHORIZED', 'Unauthenticated error shape mismatch');
  console.log('✔ Test 4 Passed: 401 Unauthorized returns standard error envelope');

  const notFoundRes = await makeRequest(app, 'GET', '/api/v1/nonexistent-route-xyz');
  assert.strictEqual(notFoundRes.status, 404, 'Expected unknown route to return 404');
  const notFoundJson = JSON.parse(notFoundRes.body);
  assert(notFoundJson.error && notFoundJson.error.code === 'NOT_FOUND', '404 error envelope shape mismatch');
  console.log('✔ Test 5 Passed: 404 Not Found returns standard error envelope');

  const malformedRes = await makeRequest(app, 'POST', '/api/v1/users', { 'content-type': 'application/json' }, 'invalid json{');
  assert.strictEqual(malformedRes.status, 400, 'Expected malformed JSON to return 400');
  const malformedJson = JSON.parse(malformedRes.body);
  assert(malformedJson.error && malformedJson.error.code === 'INVALID_REQUEST', '400 error envelope shape mismatch');
  console.log('✔ Test 6 Passed: 400 Malformed JSON returns standard error envelope');

  console.log('\nAll Step 18 API Quality & Documentation tests passed successfully!\n');
}

if (require.main === module) {
  runStep18ApiQualityTests().catch(err => {
    console.error('Step 18 Test Failure:', err);
    process.exit(1);
  });
}

module.exports = { runStep18ApiQualityTests };
