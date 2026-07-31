import { test, expect } from '@playwright/test';

const PLATFORM_EMAIL = 'superadmin@hippo.example';
const PLATFORM_PASSWORD = 'SuperAdmin@12345';
const TENANT_DEFAULT_PASSWORD = 'Admin@12345';

test.describe('Locked tenant lifecycle', () => {
  test('platform login → professional company setup → tenant login', async ({ page }) => {
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
    await expect(page.getByText('Hippo Build', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Security & isolation' }).first()).toBeVisible();
    await expect(page.getByText('Automatic protection')).toHaveCount(0);
    await expect(page.getByText(/Phase 12/i)).toHaveCount(0);

    await page.getByRole('button', { name: 'Security & isolation' }).first().click();
    await expect(page.getByRole('heading', { name: 'Platform protection model' })).toBeVisible();
    await expect(page.getByText('Private company data boundaries')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).last().click();

    await page.getByRole('button', { name: 'Add company' }).click();
    const modal = page.locator('.ant-modal');
    await modal.getByRole('textbox', { name: 'Company name' }).fill(tenantName);
    await modal.getByRole('textbox', { name: 'Login slug' }).fill(tenantSlug);
    await modal.getByRole('textbox', { name: 'Administrator email' }).fill(adminEmail);
    await modal.getByRole('textbox', { name: 'Administrator name' }).fill('E2E Admin');
    await modal.getByRole('button', { name: 'Start setup' }).click();

    await expect(page.getByRole('heading', { name: 'Organizations' })).toBeVisible();
    const organizationsTable = page.locator('.ant-table-tbody').first();
    await expect(organizationsTable).toContainText(tenantName, { timeout: 20000 });
    await expect(organizationsTable).toContainText('Ready', { timeout: 30000 });

    const drawer = page.locator('.ant-drawer-content').last();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('This company is available to authenticated users.')).toBeVisible({ timeout: 10000 });
    await expect(drawer.getByText('Current plan')).toBeVisible();

    await drawer.getByRole('tab', { name: 'Security' }).click();
    await expect(drawer.getByText('Communication security')).toBeVisible();
    await expect(drawer.locator('.ant-table-tbody')).toContainText('Email');
    await expect(drawer.locator('.ant-table-tbody')).toContainText('Sms');
    await expect(drawer.locator('.ant-table-tbody')).toContainText('Whatsapp');

    await drawer.getByRole('tab', { name: 'System' }).click();
    await expect(drawer.getByText(/tenants\/[0-9a-f-]+\//)).toBeVisible();
    await page.locator('.ant-drawer-close').last().click();

    await page.getByText('Operations', { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Platform operations' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Provisioning activity' })).toBeVisible();
    const setupTable = page.locator('.ant-tabs-tabpane-active .ant-table-tbody');
    await expect(setupTable).toContainText(tenantName);
    await expect(setupTable).toContainText('Completed');

    await page.getByText('Audit & access', { exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Audit & access' })).toBeVisible();
    await expect(page.getByText('Platform administrators')).toBeVisible();
    await expect(page.getByText(PLATFORM_EMAIL)).toBeVisible();

    await page.locator('header').getByRole('button', { name: /Super administrator/i }).click();
    await page.getByText('Sign out', { exact: true }).click();
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
    expect(authMeBody.data?.modules).toBeTruthy();
    await expect(page.locator('.ant-layout-sider')).toBeVisible();
  });
});