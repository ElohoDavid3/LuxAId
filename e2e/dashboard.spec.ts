import { test, expect } from '@playwright/test';

test.describe('Merchant Dashboard E2E', () => {
  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/.*auth\/login/);
  });

  test('login page renders correctly with form elements', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('#signin-submit')).toBeVisible();
  });
});
