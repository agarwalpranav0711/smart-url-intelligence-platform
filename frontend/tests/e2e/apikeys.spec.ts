import { test, expect } from '@playwright/test';

test.describe('API Key Management & Developer Identity E2E Tests', () => {
  test('renders unauthenticated warning card when no API key is present', async ({ page }) => {
    // 1. Navigate to /keys without auth
    await page.goto('/keys');
    await expect(page).toHaveURL(/\/keys$/);

    // 2. Verify header & auth warning card
    await expect(page.getByRole('heading', { name: 'API Key Management' })).toBeVisible();
    await expect(page.getByText('Authentication Required')).toBeVisible();
    await expect(page.getByText('An active API key is required to query developer identity details')).toBeVisible();
  });

  test('full API key lifecycle: register, view identity card, create secondary key, one-time reveal, cancel revoke, confirm revoke', async ({ page }) => {
    // Mock API routes for predictable E2E testing
    let mockKeysList = [
      {
        key_id: 'key-initial-101',
        name: 'Initial Key',
        created_at: new Date().toISOString(),
        revoked_at: null,
      },
    ];

    await page.route(/\/api\/v1\/users/, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: 'usr_e2e_123',
          key_id: 'key-initial-101',
          name: 'Initial Key',
          api_key: 'sk_live_E2E_MOCK_INITIAL_KEY_TOKEN_101',
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.route((url) => url.pathname === '/api/v1/api-keys', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ api_keys: mockKeysList }),
        });
      } else if (route.request().method() === 'POST') {
        const newKey = {
          key_id: 'key-secondary-202',
          name: 'Secondary E2E Key',
          created_at: new Date().toISOString(),
          revoked_at: null,
        };
        mockKeysList = [newKey, ...mockKeysList];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            key_id: newKey.key_id,
            name: newKey.name,
            api_key: 'sk_live_E2E_MOCK_SECONDARY_KEY_TOKEN_202',
            created_at: newKey.created_at,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(/\/api\/v1\/api-keys\/[^/]+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        const urlParts = route.request().url().split('/');
        const targetId = urlParts[urlParts.length - 1];
        mockKeysList = mockKeysList.map((k) =>
          k.key_id === targetId ? { ...k, revoked_at: new Date().toISOString() } : k
        );
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'API key revoked successfully' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/v1/auth/session', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          headers: {
            'set-cookie': 'sid=mock_sid_123; Path=/; HttpOnly; SameSite=Lax'
          },
          body: JSON.stringify({
            user_id: 'user-initial-101',
            csrf_token: 'csrf_mock_token_123',
            expires_at: new Date(Date.now() + 604800000).toISOString()
          }),
        });
      } else if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            user_id: 'user-initial-101',
            csrf_token: 'csrf_mock_token_123'
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Logged out successfully' }),
        });
      }
    });

    // 1. Authenticate via Register page in memory
    await page.goto('/register');
    await page.getByRole('button', { name: /Register Account/i }).click();
    await expect(page.getByText('Developer Account Provisioned')).toBeVisible();

    // 2. Client-side navigate to API Keys page via sidebar
    await page.getByRole('link', { name: 'API Keys' }).click();
    await expect(page).toHaveURL(/\/keys$/);

    // 3. Verify Developer Identity card & initial key metadata
    await expect(page.getByText('Developer Identity Context')).toBeVisible();
    await expect(page.getByText('Initial Key')).toBeVisible();
    await expect(page.getByText('key-initial-101')).toBeVisible();

    // 4. Open Create Secondary Key modal
    await page.getByRole('button', { name: 'Create Secondary Key' }).first().click();
    await expect(page.getByText('Provision Secondary API Key')).toBeVisible();

    // 5. Fill and submit secondary key form
    await page.getByLabel(/Key Identifier/i).fill('Secondary E2E Key');
    await page.getByRole('button', { name: 'Generate Key' }).click();

    // 6. Verify one-time raw secret reveal screen
    await expect(page.getByText('API Key Provisioned Successfully')).toBeVisible();
    await expect(page.getByText('sk_live_E2E_MOCK_SECONDARY_KEY_TOKEN_202')).toBeVisible();

    // 7. Close reveal modal
    await page.getByRole('button', { name: "I Have Saved My Key" }).click();

    // 8. Verify secondary key appears in keys table
    await expect(page.getByText('Secondary E2E Key')).toBeVisible();
    await expect(page.getByText('key-secondary-202')).toBeVisible();

    // 9. Verify Status Filter Tabs
    await page.getByRole('button', { name: /Active \(2\)/i }).click();
    await expect(page.getByText('Secondary E2E Key')).toBeVisible();

    // 10. Open Revoke Confirmation Modal for secondary key from table
    const tableRevokeBtn = page.getByRole('table').getByRole('button', { name: 'Revoke' }).first();
    await tableRevokeBtn.click();

    await expect(page.getByText('Confirm API Key Revocation')).toBeVisible();
    await expect(page.getByText('Permanent Revocation Warning')).toBeVisible();

    // 11. Test Cancel Revocation
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Confirm API Key Revocation')).not.toBeVisible();
    await expect(page.getByText('Secondary E2E Key')).toBeVisible();

    // 12. Re-open and Confirm Revocation
    const tableRevokeBtn2 = page.getByRole('table').getByRole('button', { name: 'Revoke' }).first();
    await tableRevokeBtn2.click();
    await page.getByRole('button', { name: 'Confirm Revocation' }).click();

    // 13. Verify key status changes to Revoked & modal closes
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText(/Revoked \(/i)).toBeVisible();

    // 14. Verify Revoked status filter tab
    await page.getByRole('button', { name: /Revoked/i }).last().click({ force: true });
    await expect(page.getByText('Secondary E2E Key')).toBeVisible();
  });
});
