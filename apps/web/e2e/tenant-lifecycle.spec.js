import { test, expect } from '@playwright/test';

const PLATFORM_EMAIL = 'superadmin@hippo.example';
const PLATFORM_PASSWORD = 'SuperAdmin@12345';
const TENANT_DEFAULT_PASSWORD = 'Admin@12345';

test.describe('Locked tenant lifecycle', () => {
  test('platform login → isolated provision → tenant login', async ({ page }) => {
    const tenantSlug = `pw-e2e-${Date.now()}`;
    const tenantName = `Playwright E2E ${Date.now()}`;
    const adminEmail = `admin@${tenantSlug}.test`;

    await page.goto('/platform/login');
    await expect(page.getByRole('heading', { name: 'Platform Super Admin' })).toBeVisible();
    await page.getByLabel('Email').fill(PLATFORM_EMAIL);
    await page.getByLabel('Password').fill(PLATFORM_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/platform/tenants');
    await expect(page.getByText('Platform Control Plane')).toBeVisible();
    await expect(page.getByText('Locked isolation policy')).toBeVisible();

    await page.getByRole('button', { name: 'Provision tenant' }).click();
    const modal = page.locator('.ant-modal');
    await modal.getByRole('textbox', { name: 'Organization name' }).fill(tenantName);
    await modal.getByRole('textbox', { name: 'Tenant slug' }).fill(tenantSlug);
    await modal.getByRole('textbox', { name: 'Initial administrator email' }).fill(adminEmail);
    await modal.getByRole('textbox', { name: 'Administrator name' }).fill('E2E Admin');
    await modal.getByRole('button', { name: 'Start provisioning' }).click();

    await expect(page.locator('.ant-table-tbody')).toContainText(tenantName, { timeout: 20000 });
    await expect(page.getByText('Shared DB · isolated schema').first()).toBeVisible();

    const drawer = page.locator('.ant-drawer-content');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/^tenant_[0-9a-f]{32}$/)).toBeVisible();
    await expect(drawer.getByText('Channel credential vault')).toBeVisible();

    // Auto-refresh exposes the durable state machine. CI uses sync fallback when
    // no worker is running, while full environments progress through BullMQ.
    await expect(page.locator('.ant-table-tbody')).toContainText('ACTIVE', { timeout: 30000 });
    await page.locator('.ant-drawer-close').click();

    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/platform/login');

    await page.goto('/login');
    await page.getByLabel('Tenant slug').fill(tenantSlug);
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(TENANT_DEFAULT_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page.locator('.ant-layout-sider')).toBeVisible();
  });
});
