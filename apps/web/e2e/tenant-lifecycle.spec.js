import { test, expect } from '@playwright/test';

const PLATFORM_EMAIL = 'superadmin@hippo.example';
const PLATFORM_PASSWORD = 'SuperAdmin@12345';
const TENANT_DEFAULT_PASSWORD = 'Admin@12345';

test.describe('Tenant Lifecycle E2E', () => {
  test('Platform login → create tenant → tenant login → dashboard', async ({ page }) => {
    const tenantSlug = `pw-e2e-${Date.now()}`;
    const tenantName = `Playwright E2E ${Date.now()}`;
    const adminEmail = `admin@${tenantSlug}.test`;

    // ── 1. Platform super admin login ──
    await page.goto('/platform/login');
    await expect(page.getByRole('heading', { name: 'Platform Super Admin' })).toBeVisible();

    await page.getByLabel('Email').clear();
    await page.getByLabel('Email').fill(PLATFORM_EMAIL);
    await page.getByLabel('Password').clear();
    await page.getByLabel('Password').fill(PLATFORM_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/platform/tenants');
    await expect(page.getByText('Platform Console')).toBeVisible();
    await expect(page.getByText(PLATFORM_EMAIL)).toBeVisible();

    // ── 2. Create tenant via platform console ──
    await page.getByRole('button', { name: 'Create tenant' }).click();

    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible();

    await modal.getByRole('textbox', { name: 'Name', exact: true }).fill(tenantName);
    await modal.getByRole('textbox', { name: 'Slug' }).fill(tenantSlug);
    await modal.getByRole('textbox', { name: 'Admin email' }).fill(adminEmail);
    await modal.getByRole('textbox', { name: 'Admin name' }).fill('E2E Admin');

    await modal.getByRole('button', { name: 'OK' }).click();

    await expect(page.locator('.ant-table-tbody')).toContainText(tenantName, { timeout: 15000 });
    await expect(page.locator('.ant-table-tbody')).toContainText(tenantSlug);

    // ── 3. Logout & Tenant admin login ──
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/platform/login');

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Tenant slug').clear();
    await page.getByLabel('Tenant slug').fill(tenantSlug);
    await page.getByLabel('Email').clear();
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').clear();
    await page.getByLabel('Password').fill(TENANT_DEFAULT_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    // ── 4. Verify dashboard ──
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page.locator('.ant-layout-sider')).toBeVisible({ timeout: 10000 });
  });
});
