const assert = require('assert');
const http = require('http');
const path = require('path');
const yaml = require('yamljs');
const app = require('../src/app');

let server;
let baseUrl;

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
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body
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

async function runStep25OpenApiDocsTests() {
  console.log('=== STEP 25: OPENAPI 3.0 SYNC & CONTRACT VERIFICATION TESTS ===');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify docs/openapi.yaml exists and parses cleanly via yamljs
    const specPath = path.join(__dirname, '../docs/openapi.yaml');
    let spec;
    try {
      spec = yaml.load(specPath);
    } catch (err) {
      assert.fail(`Failed to parse docs/openapi.yaml: ${err.message}`);
    }
    assert.strictEqual(spec.openapi, '3.0.3', 'OpenAPI version must be 3.0.3');
    assert.strictEqual(spec.info.title, 'Smart URL Intelligence Platform API');
    console.log('✔ docs/openapi.yaml exists and parses cleanly');

    // 2. HTTP GET /docs returns 200 (HTML interface)
    const docsRes = await request('GET', '/docs/');
    assert.strictEqual(docsRes.status, 200, 'GET /docs/ should return 200');
    assert.ok(docsRes.headers['content-type'].includes('text/html'), 'GET /docs/ should serve HTML');
    console.log('✔ GET /docs returns HTTP 200 text/html');

    // 3. HTTP GET /docs/openapi.yaml returns 200 and valid YAML
    const yamlRes = await request('GET', '/docs/openapi.yaml');
    assert.strictEqual(yamlRes.status, 200, 'GET /docs/openapi.yaml should return 200');
    const parsedYamlBody = yaml.parse(yamlRes.body);
    assert.strictEqual(parsedYamlBody.openapi, '3.0.3');
    console.log('✔ GET /docs/openapi.yaml returns HTTP 200 valid YAML');

    // 4. HTTP GET /docs/openapi.json returns 200 and valid JSON
    const jsonRes = await request('GET', '/docs/openapi.json');
    assert.strictEqual(jsonRes.status, 200, 'GET /docs/openapi.json should return 200');
    const parsedJsonBody = JSON.parse(jsonRes.body);
    assert.strictEqual(parsedJsonBody.openapi, '3.0.3');
    console.log('✔ GET /docs/openapi.json returns HTTP 200 valid JSON');

    // 5. Verify every expected route path exists in the specification
    const expectedPaths = [
      '/health',
      '/ready',
      '/metrics',
      '/api/v1/users',
      '/api/v1/auth/session',
      '/api/v1/api-keys',
      '/api/v1/api-keys/{id}',
      '/api/v1/links',
      '/api/v1/links/{code}',
      '/api/v1/links/{code}/analytics',
      '/api/v1/analytics/summary',
      '/s/{code}',
      '/docs',
      '/docs/openapi.yaml',
      '/docs/openapi.json'
    ];

    for (const expectedPath of expectedPaths) {
      assert.ok(spec.paths[expectedPath], `Path missing from openapi.yaml: ${expectedPath}`);
    }
    console.log('✔ All 15 backend route path items exist in specification');

    // 6. Verify POST, GET, DELETE on /api/v1/auth/session
    const sessionPath = spec.paths['/api/v1/auth/session'];
    assert.ok(sessionPath.post, 'POST /api/v1/auth/session must be documented');
    assert.ok(sessionPath.get, 'GET /api/v1/auth/session must be documented');
    assert.ok(sessionPath.delete, 'DELETE /api/v1/auth/session must be documented');
    console.log('✔ POST/GET/DELETE /api/v1/auth/session are fully documented');

    // 7. Verify Security Schemes in components
    const securitySchemes = spec.components?.securitySchemes;
    assert.ok(securitySchemes, 'components.securitySchemes must exist');
    assert.ok(securitySchemes.BearerAuth, 'BearerAuth scheme missing');
    assert.strictEqual(securitySchemes.BearerAuth.type, 'http');
    assert.strictEqual(securitySchemes.BearerAuth.scheme, 'bearer');

    assert.ok(securitySchemes.CookieAuth, 'CookieAuth scheme missing');
    assert.strictEqual(securitySchemes.CookieAuth.type, 'apiKey');
    assert.strictEqual(securitySchemes.CookieAuth.in, 'cookie');
    assert.strictEqual(securitySchemes.CookieAuth.name, 'sid');

    assert.ok(securitySchemes.CsrfTokenHeader, 'CsrfTokenHeader scheme missing');
    assert.strictEqual(securitySchemes.CsrfTokenHeader.type, 'apiKey');
    assert.strictEqual(securitySchemes.CsrfTokenHeader.in, 'header');
    assert.strictEqual(securitySchemes.CsrfTokenHeader.name, 'X-CSRF-Token');
    console.log('✔ BearerAuth, CookieAuth, and CsrfTokenHeader security schemes exist');

    // 8. Session endpoint security requirements representation
    assert.strictEqual(sessionPath.get.security[0].CookieAuth !== undefined, true);
    assert.strictEqual(sessionPath.delete.security[0].CookieAuth !== undefined, true);
    console.log('✔ Session endpoint security requirements accurately represented');

    // 9. Verify no duplicate operationId values
    const operationIds = new Set();
    for (const [pathKey, pathObj] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'patch', 'delete', 'put']) {
        if (pathObj[method]) {
          const opId = pathObj[method].operationId;
          assert.ok(opId, `Missing operationId for ${method.toUpperCase()} ${pathKey}`);
          assert.ok(!operationIds.has(opId), `Duplicate operationId found: ${opId}`);
          operationIds.add(opId);
        }
      }
    }
    console.log(`✔ All ${operationIds.size} operationIds are unique`);

    // 10. Verify key response codes and error envelope schema references
    assert.ok(spec.paths['/api/v1/links'].post.responses['201'], 'POST /api/v1/links 201 response missing');
    assert.ok(spec.paths['/s/{code}'].get.responses['302'], 'GET /s/{code} 302 response missing');
    assert.ok(spec.components.schemas.ErrorEnvelope, 'ErrorEnvelope schema missing');
    console.log('✔ Key status codes and response schemas verified');

  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

if (require.main === module) {
  runStep25OpenApiDocsTests()
    .then(() => {
      console.log('\n✔ STEP 25 PASSED');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ STEP 25 FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runStep25OpenApiDocsTests };
