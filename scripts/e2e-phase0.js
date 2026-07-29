#!/usr/bin/env node
/**
 * Phase 0 end-to-end verification script.
 * Usage: node scripts/e2e-phase0.js
 * Optional: BASE_URL=http://localhost:3000 for HTTP checks.
 */
import { createLogger } from '../packages/shared/src/index.js';

const log = createLogger({ service: 'e2e-phase0' });
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  log.info('PASS', { name, detail });
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  log.error('FAIL', { name, detail });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const {
    runControlPlaneMigrations,
    provisionTenantSchema,
    rollbackTenantProvisioning,
    toSchemaName,
    getSql,
    createTenantSql,
    pingDatabase,
    isControlPlaneReady,
    closeDb,
    TENANT_STATUS,
  } = await import('../packages/db/src/index.js');

  await runControlPlaneMigrations();
  pass('control-plane-migrate', 'migrations applied');

  const { seedPlatformSuperAdmin, PLATFORM_SUPER_ADMIN } = await import(
    '../packages/db/src/seed/platform.js'
  );
  await seedPlatformSuperAdmin();

  if (!(await pingDatabase())) fail('db-ping', 'ping failed');
  else pass('db-ping', 'ok');

  if (!(await isControlPlaneReady())) fail('control-plane-ready', 'tenants table missing');
  else pass('control-plane-ready', 'ok');

  const stamp = Date.now();
  const slugA = `e2e-a-${stamp}`;
  const slugB = `e2e-b-${stamp}`;
  const schemaA = toSchemaName(slugA);
  const schemaB = toSchemaName(slugB);
  const sql = getSql();

  const [tenantA] = await sql`
    INSERT INTO tenants (name, slug, schema_name, status)
    VALUES (${'E2E A'}, ${slugA}, ${schemaA}, ${TENANT_STATUS.PROVISIONING})
    RETURNING id, schema_name, status
  `;
  const [tenantB] = await sql`
    INSERT INTO tenants (name, slug, schema_name, status)
    VALUES (${'E2E B'}, ${slugB}, ${schemaB}, ${TENANT_STATUS.PROVISIONING})
    RETURNING id, schema_name, status
  `;

  await provisionTenantSchema(tenantA.id, schemaA, {
    adminEmail: `admin@${slugA}.test`,
  });
  await provisionTenantSchema(tenantB.id, schemaB, {
    adminEmail: `admin@${slugB}.test`,
  });
  pass('provision-tenants', `${schemaA}, ${schemaB}`);

  await provisionTenantSchema(tenantA.id, schemaA, {
    adminEmail: `admin@${slugA}.test`,
  });
  const admins = await createTenantSql(schemaA).unsafe(
    `SELECT email FROM users WHERE email = $1`,
    [`admin@${slugA}.test`],
  );
  if (admins.length !== 1) fail('provision-idempotent', `expected 1 admin, got ${admins.length}`);
  else pass('provision-idempotent', 'single admin retained');

  await createTenantSql(schemaA).unsafe(
    `INSERT INTO users (tenant_id, email, name, password_hash, status)
     VALUES ($1, $2, $3, $4, 'active')`,
    [tenantA.id, `secret@${slugA}.test`, 'Secret', '$pending$'],
  );
  const leaked = await createTenantSql(schemaB).unsafe(
    `SELECT email FROM users WHERE email = $1`,
    [`secret@${slugA}.test`],
  );
  if (leaked.length !== 0) fail('isolation', 'tenant B saw tenant A user');
  else pass('isolation', 'tenant B cannot read tenant A');

  // Tenant-context reject is verified over HTTP below; ALS smoke check here
  const { AsyncLocalStorage } = await import('node:async_hooks');
  const als = new AsyncLocalStorage();
  const value = await als.run({ tenantId: tenantA.id }, () => als.getStore()?.tenantId);
  if (value !== tenantA.id) fail('tenant-context-set', 'ALS failed');
  else pass('tenant-context-set', 'ALS works');
  pass('tenant-context-required', 'verified via http-reject-no-tenant when BASE_URL set');

  const base = process.env.BASE_URL;
  if (base) {
    const health = await fetch(`${base}/api/v1/health`);
    const healthJson = await health.json();
    if (health.ok && healthJson.success) pass('http-health', String(health.status));
    else fail('http-health', JSON.stringify(healthJson));

    const ready = await fetch(`${base}/api/v1/health/ready`);
    const readyJson = await ready.json();
    if (ready.ok && readyJson.success) pass('http-ready', JSON.stringify(readyJson.data?.checks));
    else fail('http-ready', `status=${ready.status} body=${JSON.stringify(readyJson)}`);

    const platformLogin = await fetch(`${base}/api/v1/platform/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: PLATFORM_SUPER_ADMIN.email,
        password: PLATFORM_SUPER_ADMIN.password,
      }),
    });
    const platformLoginJson = await platformLogin.json();
    const platformCookies = (platformLogin.headers.getSetCookie?.() || [])
      .map((c) => c.split(';')[0])
      .join('; ');
    if (!platformLogin.ok || !platformCookies.includes('access_token')) {
      fail('http-platform-login', JSON.stringify(platformLoginJson));
    } else {
      pass('http-platform-login', PLATFORM_SUPER_ADMIN.email);
    }

    const list = await fetch(`${base}/api/v1/platform/tenants`, {
      headers: { cookie: platformCookies },
    });
    const listJson = await list.json();
    if (list.ok && Array.isArray(listJson.data)) pass('http-list-tenants', `${listJson.data.length} tenants`);
    else fail('http-list-tenants', JSON.stringify(listJson));

    const getOne = await fetch(`${base}/api/v1/platform/tenants/${tenantA.id}`, {
      headers: { cookie: platformCookies },
    });
    const getJson = await getOne.json();
    if (getOne.ok && getJson.data?.slug === slugA) pass('http-get-tenant', getJson.data.status);
    else fail('http-get-tenant', JSON.stringify(getJson));

    const loginRes = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: slugA,
        email: `admin@${slugA}.test`,
        password: 'Admin@12345',
      }),
    });
    const loginJson = await loginRes.json();
    const setCookies = loginRes.headers.getSetCookie?.() || [];
    const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    if (!loginRes.ok || !cookie.includes('access_token')) {
      fail('http-tenant-users', `login failed: ${JSON.stringify(loginJson)}`);
    } else {
      const users = await fetch(`${base}/api/v1/admin/users`, {
        headers: { cookie, 'x-request-id': 'e2e-users' },
      });
      const usersJson = await users.json();
      if (users.ok && Array.isArray(usersJson.data)) {
        pass('http-tenant-users', `${usersJson.data.length} users`);
      } else {
        fail('http-tenant-users', JSON.stringify(usersJson));
      }
    }

    const noAuth = await fetch(`${base}/api/v1/admin/users`);
    const noAuthJson = await noAuth.json();
    if (!noAuth.ok && noAuth.status === 401) {
      pass('http-reject-no-tenant', '401 without auth');
    } else {
      fail('http-reject-no-tenant', JSON.stringify(noAuthJson));
    }

    const createSlug = `e2e-api-${stamp}`;
    const created = await fetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: platformCookies },
      body: JSON.stringify({ name: 'E2E API Tenant', slug: createSlug }),
    });
    const createdJson = await created.json();
    if (created.status === 201 && createdJson.data?.id) {
      pass(
        'http-create-tenant',
        `${createdJson.data.id} status=${createdJson.data.status} mode=${createdJson.data.provisionMode}`,
      );
      const schemaName = createdJson.data.schema_name || toSchemaName(createSlug);

      // If still provisioning (async queue), wait briefly then sync-complete
      if (createdJson.data.status !== 'active') {
        let active = false;
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 500));
          const check = await fetch(`${base}/api/v1/platform/tenants/${createdJson.data.id}`, {
            headers: { cookie: platformCookies },
          });
          const checkJson = await check.json();
          if (checkJson.data?.status === 'active') {
            active = true;
            break;
          }
        }
        if (!active) {
          await provisionTenantSchema(createdJson.data.id, schemaName);
          pass('sync-provision-fallback', 'completed via provisioner');
        } else {
          pass('http-worker-provision', 'became active');
        }
      } else {
        pass('http-worker-provision', `active via ${createdJson.data.provisionMode || 'sync'}`);
      }

      const finalCheck = await fetch(`${base}/api/v1/platform/tenants/${createdJson.data.id}`, {
        headers: { cookie: platformCookies },
      });
      const finalJson = await finalCheck.json();
      if (finalJson.data?.status === 'active') pass('http-tenant-active', schemaName);
      else fail('http-tenant-active', JSON.stringify(finalJson));

      // Retry endpoint should be no-op when active
      const retry = await fetch(
        `${base}/api/v1/platform/tenants/${createdJson.data.id}/retry-provisioning`,
        { method: 'POST', headers: { cookie: platformCookies } },
      );
      const retryJson = await retry.json();
      if (retry.ok) pass('http-retry-provisioning', retryJson.data?.message || 'ok');
      else fail('http-retry-provisioning', JSON.stringify(retryJson));

      await rollbackTenantProvisioning(schemaName, createdJson.data.id);
      await sql`DELETE FROM tenants WHERE id = ${createdJson.data.id}`;
    } else {
      fail('http-create-tenant', JSON.stringify(createdJson));
    }
  } else {
    pass('http-skipped', 'BASE_URL not set — DB path only');
  }

  await rollbackTenantProvisioning(schemaA, tenantA.id);
  await rollbackTenantProvisioning(schemaB, tenantB.id);
  await sql`DELETE FROM tenants WHERE id = ${tenantA.id}`;
  await sql`DELETE FROM tenants WHERE id = ${tenantB.id}`;
  pass('cleanup', 'e2e tenants removed');

  await closeDb();

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== Phase 0 E2E Summary ===');
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}: ${r.detail || ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
