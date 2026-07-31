import { test, expect } from '@playwright/test';

const PLATFORM_EMAIL = 'superadmin@hippo.example';
const PLATFORM_PASSWORD = 'SuperAdmin@12345';
const TENANT_DEFAULT_PASSWORD = 'Admin@12345';

test.describe('Locked tenant lifecycle', () => {
  test('platform login → simple company setup → tenant login', async ({ page }) => {
    const tenantSlug = `pw-e2e-${Date.now()}`;
    const tenantName = `Playwright E2E ${Date.now()}`;
    const adminEmail = `admin@${tenantSlug}.test`;

    await page.goto('/platform/login');
    await expect(page.getByRole('heading', { name: 'Platform Super Admin' })).toBeVisible();
    await page.getByLabel('Email').fill(PLATFORM_EMAIL);
    await page.getByLabel('Password').fill(PLATFORM_PASSWORD);
    const platformLogin = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/platform/auth/login') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Sign in' }).click();
    expect((await platformLogin).status()).toBe(200);

    await page.waitForURL('**/platform/tenants');
    await expect(page.getByText('Hippo Build Platform Admin')).toBeVisible();
    await expect(page.getByText('Automatic protection')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Plans & subscriptions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Setup activity' })).toBeVisible();

    await page.getByRole('button', { name: 'Add company' }).click();
    const modal = page.locator('.ant-modal');
    await modal.getByRole('textbox', { name: 'Company name' }).fill(tenantName);
    await modal.getByRole('textbox', { name: 'Login name' }).fill(tenantSlug);
    await modal.getByRole('textbox', { name: 'Administrator email' }).fill(adminEmail);
    await modal.getByRole('textbox', { name: 'Administrator name' }).fill('E2E Admin');
    await modal.getByRole('button', { name: 'Start setup' }).click();

    await expect(page.locator('.ant-table-tbody')).toContainText(tenantName, { timeout: 20000 });
    await expect(page.locator('.ant-table-tbody')).toContainText('Ready', { timeout: 30000 });

    const drawer = page.locator('.ant-drawer-content');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('This company is ready to use Hippo Build.')).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByText('Communication')).toBeVisible();
    await expect(drawer.locator('.ant-table-tbody')).toContainText('email');
    await expect(drawer.locator('.ant-table-tbody')).toContainText('sms');
    await expect(drawer.locator('.ant-table-tbody')).toContainText('whatsapp');

    await drawer.getByText('Advanced details').click();
    await expect(drawer.getByText(/tenants\/[0-9a-f-]+\//)).toBeVisible();
    await page.locator('.ant-drawer-close').click();

    await page.getByRole('tab', { name: 'Setup activity' }).click();
    await expect(page.locator('.ant-table-tbody')).toContainText(tenantName);
    await expect(page.locator('.ant-table-tbody')).toContainText('Completed');

    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/platform/login');

    await page.goto('/login');
    await page.getByLabel('Tenant slug').fill(tenantSlug);
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password').fill(TENANT_DEFAULT_PASSWORD);
    const tenantLogin = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/auth/login') && response.request().method() === 'POST',
    );
    const authMe = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/auth/me') && response.request().method() === 'GET',
    );
    await page.getByRole('button', { name: 'Login' }).click();
    expect((await tenantLogin).status()).toBe(200);

    await page.waitForURL('**/dashboard', { timeout: 15000 });
    const authMeResponse = await authMe;
    expect(authMeResponse.status()).toBe(200);
    const authMeBody = await authMeResponse.json();
    expect(authMeBody.data?.tenant?.slug).toBe(tenantSlug);
    await expect(page.locator('.ant-layout-sider')).toBeVisible();
  });
});
