import { test, expect } from '@playwright/test';

test.describe('Web Session Authentication E2E Tests', () => {
  test('register account, establish session, reload, and logout', async ({ page }) => {
    // 1. Navigate to Register page
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Developer Registration' })).toBeVisible();

    // 2. Submit new developer registration
    const keyNameInput = page.getByLabel(/Key Identifier \/ Name/i).first();
    await keyNameInput.fill('Playwright E2E Key');
    await page.getByRole('button', { name: /Register Account & Key/i }).click();

    // 3. Verify registration success & one-time API key reveal
    await expect(page.getByText('Developer Account Provisioned Successfully')).toBeVisible();
    await expect(page.getByText('sk_live_')).toBeVisible();

    // 4. Click Go to Dashboard
    await page.getByRole('button', { name: /Go to Dashboard/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // 5. Verify session indicator in header
    await expect(page.getByText('Session:')).toBeVisible();

    // 6. Reload page & verify session survives browser reload
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Session:')).toBeVisible();

    // 7. Click Logout button in header
    const logoutBtn = page.getByTitle(/Terminate web session/i);
    await logoutBtn.click();

    // 8. Verify unauthenticated state
    await expect(page.getByText('Unauthenticated')).toBeVisible();

    // 9. Reload page and confirm unauthenticated status persists
    await page.reload();
    await expect(page.getByText('Unauthenticated')).toBeVisible();
  });
});
