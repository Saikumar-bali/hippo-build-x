import { test, expect } from '@playwright/test';

test('Keystone Civil tenant admin login', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Override the default "green-valley" slug
  await page.getByLabel('Tenant slug').clear();
  await page.getByLabel('Tenant slug').fill('keystone-civil');

  await page.getByLabel('Email').clear();
  await page.getByLabel('Email').fill('ops@keystonecivil.org');
  await page.getByLabel('Password').clear();
  await page.getByLabel('Password').fill('Admin@12345');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await expect(page.getByText('Dashboard').or(page.getByText('Welcome'))).toBeVisible({ timeout: 10000 });

  // Verify we see the Keystone Civil context
  await expect(page.getByText(/david|keystone|ops/i).first()).toBeVisible();
});
