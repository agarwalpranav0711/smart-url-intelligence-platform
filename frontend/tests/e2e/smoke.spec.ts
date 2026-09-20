import { test, expect } from '@playwright/test';

test.describe('Frontend Foundation Smoke Tests', () => {
  test('navigates to dashboard page and renders console shell', async ({ page }) => {
    await page.goto('/');

    // Should redirect / to /dashboard
    await expect(page).toHaveURL(/\/dashboard$/);

    // Header and Sidebar should be rendered
    await expect(page.getByText('Smart URL Console')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Infrastructure Overview' })).toBeVisible();
  });

  test('navigation links work correctly', async ({ page }) => {
    await page.goto('/dashboard');

    // Click Links nav item
    await page.getByRole('link', { name: 'Links' }).click();
    await expect(page).toHaveURL(/\/links$/);
    await expect(page.getByRole('heading', { name: 'Link Registry' })).toBeVisible();

    // Click System Status nav item
    await page.getByRole('link', { name: 'System Status' }).click();
    await expect(page).toHaveURL(/\/status$/);
    await expect(page.getByRole('heading', { name: 'System Status & Operations' })).toBeVisible();
  });

  test('renders 404 page for unknown routes', async ({ page }) => {
    await page.goto('/unknown-random-route');
    await expect(page.getByRole('heading', { name: /404 — Route Not Found/i })).toBeVisible();
  });

  test('renders visual routing builder and interacts with rule selector modal', async ({ page }) => {
    await page.goto('/links/demo-code/routing');

    // Page heading and primary controls
    await expect(page.getByRole('heading', { name: 'Visual Routing Builder' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Pipeline/i })).toBeVisible();

    const addRuleButton = page.getByRole('button', { name: /Add Routing Rule/i }).first();
    await expect(addRuleButton).toBeVisible();

    // Open Add Rule modal and verify options
    await addRuleButton.click();
    await expect(page.getByText('Time-Based Routing')).toBeVisible();
    await expect(page.getByText('Device-Based Routing')).toBeVisible();
    await expect(page.getByText('Weighted Traffic Distribution (A/B)')).toBeVisible();

    // Close modal using Escape key
    await page.keyboard.press('Escape');
    await expect(page.getByText('Time-Based Routing')).not.toBeVisible();
  });
});
