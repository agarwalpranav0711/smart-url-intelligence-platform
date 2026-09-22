import { test, expect } from '@playwright/test';

test.describe('Analytics & Traffic Intelligence E2E Tests', () => {
  test('renders unauthenticated warning card when no API key is present', async ({ page }) => {
    // 1. Navigate to /analytics without auth
    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/analytics$/);

    // 2. Verify analytics page header renders
    await expect(page.getByRole('heading', { name: 'Analytics & Traffic Intelligence' })).toBeVisible();

    // 3. Verify unauthenticated warning card
    await expect(page.getByText('Authentication Required')).toBeVisible();
    await expect(page.getByText('An API key is required to query system analytics')).toBeVisible();
  });

  test('full analytics dashboard workflow: summary, presets, leaderboard, per-link chart, breakdown & navigation', async ({ page }) => {
    // Intercept backend API requests using regex route matching
    await page.route(/\/api\/v1\/users/, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: 'usr_test',
          key_id: 'key_test',
          name: 'Developer Key',
          api_key: 'e2e_mock_api_key_1234567890',
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.route(/\/api\/v1\/analytics\/summary/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_clicks: 1250,
          active_links_count: 8,
          time_range: {
            from: '2026-08-21T00:00:00.000Z',
            to: '2026-09-20T22:00:00.000Z',
          },
          top_links: [
            {
              short_code: 'demo-code',
              target_url: 'https://example.com/dest',
              clicks: 800,
            },
          ],
        }),
      });
    });

    await page.route((url) => url.pathname === '/api/v1/links', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          links: [
            {
              short_code: 'demo-code',
              target_url: 'https://example.com/dest',
              click_count: 800,
              is_active: true,
              created_at: '2026-09-01T00:00:00.000Z',
              expires_at: null,
              routing_config: null,
            },
          ],
          limit: 100,
          offset: 0,
        }),
      });
    });

    await page.route(/\/api\/v1\/links\/[^/]+\/analytics/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          short_code: 'demo-code',
          total_clicks: 800,
          time_range: {
            from: '2026-08-21T00:00:00.000Z',
            to: '2026-09-20T22:00:00.000Z',
            interval: 'day',
          },
          traffic_series: [
            { timestamp: '2026-09-19T00:00:00.000Z', clicks: 350 },
            { timestamp: '2026-09-20T00:00:00.000Z', clicks: 450 },
          ],
          routing_breakdown: [
            {
              route_type: 'default',
              route_key: 'default',
              destination_url: 'https://example.com/dest',
              clicks: 800,
              percentage: 100.0,
            },
          ],
        }),
      });
    });

    // 1. Authenticate via Register page in memory
    await page.goto('/register');
    await page.getByRole('button', { name: /Register Account/i }).click();
    await expect(page.getByText('Developer Account Provisioned')).toBeVisible();

    // 2. Client-side navigate to Analytics page via sidebar navigation (preserving memory Auth state)
    await page.getByRole('link', { name: 'Analytics' }).click();
    await expect(page).toHaveURL(/\/analytics$/);

    // 3. Verify analytics page heading
    await expect(page.getByRole('heading', { name: 'Analytics & Traffic Intelligence' })).toBeVisible();

    // 4. Verify global summary metrics cards
    await expect(page.getByText('1,250')).toBeVisible();
    await expect(page.getByText('Active Links')).toBeVisible();

    // 5. Verify top links leaderboard
    await expect(page.getByText('Top Links Leaderboard')).toBeVisible();
    await expect(page.getByText('#1')).toBeVisible();
    await expect(page.getByText('800 clicks')).toBeVisible();

    // 6. Test date range preset switching
    await page.getByRole('button', { name: 'Last 24 Hours' }).click();
    await expect(page.getByRole('button', { name: 'Last 24 Hours' })).toBeVisible();
    await page.getByRole('button', { name: 'Last 7 Days' }).click();

    // 7. Test interval switching
    await page.getByRole('button', { name: 'Hourly' }).click();
    await page.getByRole('button', { name: 'Daily' }).click();

    // 8. Verify per-link analytics section for selected link
    await expect(page.getByText('Shortcode Traffic Deep-Dive')).toBeVisible();
    await expect(page.getByText('Inspecting:')).toBeVisible();

    // 9. Verify native SVG traffic chart
    await expect(page.getByRole('img', { name: /Time series traffic chart/i })).toBeVisible();

    // 10. Verify routing breakdown table
    await expect(page.getByText('Traffic Routing Breakdown')).toBeVisible();
    await expect(page.getByText('Default Rule')).toBeVisible();

    // 11. Verify link navigation to link detail context
    await page.getByRole('button', { name: /View Link Details/i }).click();
    await expect(page).toHaveURL(/\/links\/demo-code$/);
  });
});
