import { test, expect } from '@playwright/test';

test.describe('Code Generator E2E Tests', () => {
  test.beforeEach(async ({ context }) => {
    try {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    } catch {}
  });

  test('CodeGenerator renders on API Keys page with operation switching, language switching, copy feedback, and placeholder API key', async ({ page }) => {
    // 1. Mock session auth endpoints
    await page.route(/\/api\/v1\/auth\/session/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, user_id: 'usr_e2e_code_gen', csrf_token: 'csrf_mock_123' }),
      });
    });

    await page.route((url) => url.pathname === '/api/v1/api-keys', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          api_keys: [
            {
              key_id: 'key-101',
              name: 'Primary Key',
              created_at: new Date().toISOString(),
              revoked_at: null,
            },
          ],
        }),
      });
    });

    // 2. Navigate to API Keys page
    await page.goto('/keys');

    // 3. Verify "Using your API key" header & CodeGenerator presence
    await expect(page.getByText('Using your API key')).toBeVisible();
    await expect(page.getByText('Code Generator')).toBeVisible();
    await expect(page.getByText('Programmatic API clients use Bearer API keys')).toBeVisible();

    // 4. Verify cURL snippet default for Create Link
    await expect(page.locator('pre code')).toContainText('curl -X POST');
    await expect(page.locator('pre code')).toContainText('Authorization: Bearer YOUR_API_KEY');

    // 5. Switch language to Python
    await page.getByRole('tab', { name: 'Python' }).click();
    await expect(page.locator('pre code')).toContainText('import requests');
    await expect(page.locator('pre code')).toContainText('"Authorization": "Bearer YOUR_API_KEY"');

    // 6. Switch operation to List Links
    await page.getByRole('button', { name: /List Links/i }).click();
    await expect(page.locator('pre code')).toContainText('/api/v1/links');
    await expect(page.locator('pre code')).toContainText('params =');

    // 7. Click Copy button and verify Copied! feedback
    await page.getByRole('button', { name: /Copy code to clipboard/i }).click();
    await expect(page.getByText('Copied!')).toBeVisible();

    // 8. Verify no real credential tokens appear anywhere in CodeGenerator HTML
    const generatorHtml = await page.locator('pre code').innerHTML();
    expect(generatorHtml).not.toContain('sk_live_');
    expect(generatorHtml).not.toContain('sess_');
    expect(generatorHtml).not.toContain('csrf_');
  });

  test('CodeGenerator renders on Link Detail page with pre-populated short code', async ({ page }) => {
    // Mock session auth endpoints
    await page.route(/\/api\/v1\/auth\/session/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, user_id: 'usr_e2e_code_gen', csrf_token: 'csrf_mock_123' }),
      });
    });

    await page.route(/\/api\/v1\/links\?/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          links: [
            {
              short_code: 'demo-link-88',
              target_url: 'https://example.com/demo',
              click_count: 42,
              is_active: true,
              created_at: new Date().toISOString(),
              expires_at: null,
              routing_config: null,
            },
          ],
          limit: 100,
          offset: 0,
        }),
      });
    });

    await page.route(/\/api\/v1\/links\/demo-link-88\/analytics/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          short_code: 'demo-link-88',
          total_clicks: 42,
          time_range: { interval: 'day' },
          traffic_series: [],
          routing_breakdown: [],
        }),
      });
    });

    // Navigate to Link Detail page for short code "demo-link-88"
    await page.goto('/links/demo-link-88');

    // Verify Developer API Usage section and CodeGenerator
    await expect(page.getByText('Developer API Usage')).toBeVisible();
    await expect(page.getByText('Code Generator')).toBeVisible();

    // Verify pre-populated short code "demo-link-88" in the generated snippet
    await expect(page.locator('pre code')).toContainText('demo-link-88');
    await expect(page.locator('pre code')).toContainText('Authorization: Bearer YOUR_API_KEY');
  });
});
