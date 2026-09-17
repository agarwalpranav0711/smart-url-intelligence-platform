/**
 * Setup script for load testing data.
 * Provisions a test user and short codes via the public API,
 * writing the configuration to load-tests/test-config.json and .env.test.
 */
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function setupTestData() {
  console.log(`Setting up load-test data against ${API_BASE_URL}...`);

  // 1. Create a load-test developer user
  const email = `loadtest_dev_${Date.now()}_${Math.floor(Math.random() * 1000)}@example.com`;
  const userRes = await fetch(`${API_BASE_URL}/api/v1/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!userRes.ok) {
    const errText = await userRes.text();
    throw new Error(`Failed to create test user (${userRes.status}): ${errText}`);
  }

  const userData = await userRes.json();
  const apiKey = userData.api_key;
  const userId = userData.user_id;

  console.log(`User created: ${userId}`);

  // 2. Create several short codes for redirect load tests
  const shortCodes = [];
  for (let i = 1; i <= 5; i++) {
    const linkRes = await fetch(`${API_BASE_URL}/api/v1/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        target_url: `https://example.com/load-test-target-${i}`,
      }),
    });

    if (!linkRes.ok) {
      const errText = await linkRes.text();
      throw new Error(`Failed to create test link ${i} (${linkRes.status}): ${errText}`);
    }

    const linkData = await linkRes.json();
    shortCodes.push(linkData.short_code);
  }

  console.log(`Created ${shortCodes.length} short codes: ${shortCodes.join(', ')}`);

  // 3. Prepare test config data
  const testConfig = {
    apiBaseUrl: API_BASE_URL,
    userId,
    apiKey,
    shortCodes,
    primaryShortCode: shortCodes[0],
    createdAt: new Date().toISOString(),
  };

  // Write load-tests/test-config.json
  const configPath = path.join(__dirname, '..', 'load-tests', 'test-config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2), 'utf8');
  console.log(`Saved test configuration to ${configPath}`);

  // Write .env.test
  const envPath = path.join(__dirname, '..', '.env.test');
  const envContent = [
    `LOADTEST_API_BASE_URL=${API_BASE_URL}`,
    `LOADTEST_API_KEY=${apiKey}`,
    `LOADTEST_PRIMARY_SHORT_CODE=${shortCodes[0]}`,
    `LOADTEST_SHORT_CODES=${shortCodes.join(',')}`,
  ].join('\n');
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`Saved environment variables to ${envPath}`);

  console.log('\nLoad-test data setup completed successfully!');
}

setupTestData().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
