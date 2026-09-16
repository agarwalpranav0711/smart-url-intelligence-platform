const assert = require('assert');
const crypto = require('crypto');
const usersDb = require('../src/db/users');
const authenticateApiKey = require('../src/middleware/auth');
const { pool } = require('../src/config/db');

async function runStep3Tests() {
  console.log('=== Step 3: API Key Auth & User DB Layer Verification ===\n');

  let testUser = null;
  const rawTestApiKey = `test_key_${crypto.randomBytes(16).toString('hex')}`;
  const testApiKeyHash = crypto.createHash('sha256').update(rawTestApiKey).digest('hex');

  // Helper to create mock Express req, res, next
  function createMockReqRes(headers = {}) {
    const req = {
      headers,
      get: (headerName) => headers[headerName.toLowerCase()] || headers[headerName]
    };
    const res = {
      statusCode: null,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };
    return { req, res, next, isNextCalled: () => nextCalled };
  }

  try {
    // Setup: Create temporary test user in DB
    testUser = await usersDb.createUser(testApiKeyHash);
    console.log(`[SETUP] Created test user with UUID: ${testUser.user_id}`);

    // TEST 1: Missing Authorization header -> 401
    {
      const { req, res, next, isNextCalled } = createMockReqRes({});
      await authenticateApiKey(req, res, next);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 status for missing header');
      assert.deepStrictEqual(res.jsonData, {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      assert.strictEqual(isNextCalled(), false, 'next() should not be called');
      console.log('✔ Test 1 Passed: Missing Authorization header returns 401 JSON');
    }

    // TEST 2: Malformed Authorization header -> 401
    {
      const malformedHeaders = [
        'Basic dXNlcjpwYXNz',
        'Bearer',
        'Bearer ',
        'Token 12345',
        'JustAString'
      ];
      for (const authVal of malformedHeaders) {
        const { req, res, next, isNextCalled } = createMockReqRes({ authorization: authVal });
        await authenticateApiKey(req, res, next);
        assert.strictEqual(res.statusCode, 401, `Expected 401 status for header "${authVal}"`);
        assert.deepStrictEqual(res.jsonData, {
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
        assert.strictEqual(isNextCalled(), false, 'next() should not be called');
      }
      console.log('✔ Test 2 Passed: Malformed Authorization header returns 401 JSON');
    }

    // TEST 3: Invalid Bearer API key -> 401
    {
      const invalidApiKey = `Bearer invalid_key_${crypto.randomBytes(8).toString('hex')}`;
      const { req, res, next, isNextCalled } = createMockReqRes({ authorization: invalidApiKey });
      await authenticateApiKey(req, res, next);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 status for invalid API key');
      assert.deepStrictEqual(res.jsonData, {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
      });
      assert.strictEqual(isNextCalled(), false, 'next() should not be called');
      console.log('✔ Test 3 Passed: Invalid Bearer API key returns 401 JSON without exposing existence details');
    }

    // TEST 4 & 5: Valid API key hash matching test user -> succeeds & attaches minimal req.user
    {
      const validHeader = `Bearer ${rawTestApiKey}`;
      const { req, res, next, isNextCalled } = createMockReqRes({ authorization: validHeader });
      await authenticateApiKey(req, res, next);
      assert.strictEqual(isNextCalled(), true, 'next() must be called on valid API key');
      assert.ok(req.user, 'req.user must be attached');
      assert.strictEqual(req.user.userId, testUser.user_id, 'req.user.userId must match DB user_id');
      assert.strictEqual(Object.keys(req.user).length, 1, 'req.user must contain only user identity (userId)');
      assert.strictEqual(req.user.api_key_hash, undefined, 'api_key_hash must NOT be attached to req.user');
      console.log('✔ Test 4 & 5 Passed: Valid API key authenticates and attaches only req.user = { userId }');
    }

    // TEST 6: Plaintext API key is never stored or returned
    {
      const dbUser = await usersDb.findUserByApiKeyHash(testApiKeyHash);
      assert.ok(dbUser, 'User should be found in DB by hash');
      assert.strictEqual(dbUser.user_id, testUser.user_id);
      assert.strictEqual(dbUser.api_key_hash, undefined, 'findUserByApiKeyHash returns only user_id and created_at');

      // Direct query to verify stored value in users table is SHA-256 hash, not plaintext
      const directQueryResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [testUser.user_id]);
      const rawDbRow = directQueryResult.rows[0];
      assert.strictEqual(rawDbRow.api_key_hash, testApiKeyHash, 'Stored DB value is the SHA-256 hash');
      assert.notStrictEqual(rawDbRow.api_key_hash, rawTestApiKey, 'Plaintext API key is NOT stored in DB');
      console.log('✔ Test 6 Passed: Plaintext API key is never stored in DB or returned by DB helpers');
    }

    // TEST 7: Zero logging of raw API key or Authorization header
    {
      let consoleLogCalled = false;
      let consoleErrorCalled = false;
      const originalLog = console.log;
      const originalError = console.error;

      // Intercept console output during authentication attempt
      console.log = (...args) => {
        const text = args.join(' ');
        if (text.includes(rawTestApiKey) || text.includes('Authorization')) consoleLogCalled = true;
      };
      console.error = (...args) => {
        const text = args.join(' ');
        if (text.includes(rawTestApiKey) || text.includes('Authorization')) consoleErrorCalled = true;
      };

      const validHeader = `Bearer ${rawTestApiKey}`;
      const { req, res, next } = createMockReqRes({ authorization: validHeader });
      await authenticateApiKey(req, res, next);

      console.log = originalLog;
      console.error = originalError;

      assert.strictEqual(consoleLogCalled, false, 'Raw API key or Authorization header was logged via console.log');
      assert.strictEqual(consoleErrorCalled, false, 'Raw API key or Authorization header was logged via console.error');
      console.log('✔ Test 7 Passed: Plaintext API key and Authorization header are never logged');
    }

    // TEST 8: SQL queries use parameterized values
    {
      const usersDbCode = require('fs').readFileSync(require.resolve('../src/db/users'), 'utf8');
      assert.ok(usersDbCode.includes('$1'), 'users.js must use $1 parameter placeholders');
      assert.strictEqual(usersDbCode.includes('${'), false, 'users.js must NOT use string template interpolation for values');
      console.log('✔ Test 8 Passed: SQL queries strictly use parameterized values ($1)');
    }

    // TEST 9: Simulated internal database failure -> 500 without exposing DB details or credentials
    {
      const originalFindUser = usersDb.findUserByApiKeyHash;
      let loggedErrorText = '';
      const originalConsoleError = console.error;

      // Mock internal DB exception
      usersDb.findUserByApiKeyHash = async () => {
        throw new Error('connection to server at "localhost" (127.0.0.1), port 5432 failed: FATAL: DB failure');
      };

      console.error = (...args) => {
        loggedErrorText += args.join(' ');
      };

      const validHeader = `Bearer ${rawTestApiKey}`;
      const { req, res, next, isNextCalled } = createMockReqRes({ authorization: validHeader });

      await authenticateApiKey(req, res, next);

      // Restore original functions
      usersDb.findUserByApiKeyHash = originalFindUser;
      console.error = originalConsoleError;

      assert.strictEqual(res.statusCode, 500, 'Expected 500 status on internal DB error');
      assert.deepStrictEqual(res.jsonData, {
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }
      }, 'Internal error response must match 500 JSON schema without DB details');

      assert.strictEqual(isNextCalled(), false, 'next() must not be called on error');
      assert.strictEqual(loggedErrorText.includes(rawTestApiKey), false, 'Raw API key must NOT be logged during error');
      assert.strictEqual(loggedErrorText.includes('Authorization'), false, 'Authorization header must NOT be logged during error');

      console.log('✔ Test 9 Passed: Internal database failure returns HTTP 500 JSON without exposing DB details or credentials');
    }

    console.log('\nAll Step 3 verification tests completed successfully!');

  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup: Delete temporary test user
    if (testUser) {
      const deleted = await usersDb.deleteUserById(testUser.user_id);
      console.log(`[CLEANUP] Test user ${testUser.user_id} deleted: ${deleted}`);
    }
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  runStep3Tests();
}

module.exports = runStep3Tests;
