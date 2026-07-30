#!/usr/bin/env node
/** PRD §5 end-to-end verification. Optional BASE_URL adds HTTP/UI API checks. */
import { createLogger } from '../packages/shared/src/index.js';

const log = createLogger({ service: 'e2e-phase0' });
const results = [];
const pass = (name, detail) => {
  results.push({ name, ok: true, detail });
  log.info('PASS', { name, detail });
};
const fail = (name, detail) => {
  results.push({ name, ok: false, detail });
  log.error('FAIL', { name, detail });
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const {
    runControlPlaneMigrations,
    provisionTenantSchema,
    rollbackTenantProvisioning,
    toTenantSchemaName,
    createControlPlaneSql,
    createTenantSql,
    pingDatabase,
    isControlPlaneReady,
    closeDb,
    TENANT_STATUS,
  } = await import('../packages/db/src/index.js');
  const { seedPlatformSuperAdmin, PLATFORM_SUPER_ADMIN } = await import(
    '../packages/db/src/seed/platform.js'
  );

  await runControlPlaneMigrations();
  await seedPlatformSuperAdmin();
  pass('control-plane-migrate', 'explicit control_plane ready');
  (await pingDatabase()) ? pass('db-ping', 'ok') : fail('db-ping', 'failed');
  (await isControlPlaneReady())
    ? pass('control-plane-ready', 'control_plane.tenants found')
    : fail('control-plane-ready', 'missing');

  const cp = createControlPlaneSql();
  const stamp = Date.now();
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const slugA = `e2e-a-${stamp}`;
  const slugB = `e2e-b-${stamp}`;
  const schemaA = toTenantSchemaName(tenantA);
  const schemaB = toTenantSchemaName(tenantB);

  await cp`
    INSERT INTO tenants (id, name, slug, schema_name, status, isolation_mode)
    VALUES (${tenantA}, 'E2E A', ${slugA}, ${schemaA}, ${TENANT_STATUS.PROVISIONING}, 'shared_schema'),
           (${tenantB}, 'E2E B', ${slugB}, ${schemaB}, ${TENANT_STATUS.PROVISIONING}, 'shared_schema')
  `;
  await provisionTenantSchema(tenantA, schemaA, { adminEmail: `admin@${slugA}.test` });
  await provisionTenantSchema(tenantB, schemaB, { adminEmail: `admin@${slugB}.test` });
  pass('provision-tenants', `${schemaA}, ${schemaB}`);

  const sqlA = createTenantSql(schemaA, tenantA);
  const sqlB = createTenantSql(schemaB, tenantB);
  await provisionTenantSchema(tenantA, schemaA, { adminEmail: `admin@${slugA}.test` });
  const admins = await sqlA.unsafe(`SELECT email FROM users WHERE email = $1`, [
    `admin@${slugA}.test`,
  ]);
  admins.length === 1
    ? pass('provision-idempotent', 'single admin retained')
    : fail('provision-idempotent', `found ${admins.length}`);

  await sqlA.unsafe(
    `INSERT INTO users (tenant_id, email, name, password_hash, status)
     VALUES ($1, $2, 'Secret', '$pending$', 'active')`,
    [tenantA, `secret@${slugA}.test`],
  );
  const leaked = await sqlB.unsafe(`SELECT email FROM users WHERE email = $1`, [
    `secret@${slugA}.test`,
  ]);
  leaked.length === 0
    ? pass('normal-isolation', 'tenant B cannot read tenant A')
    : fail('normal-isolation', 'data leaked');

  const qualifiedLeak = await sqlB.unsafe(
    `SELECT email FROM "${schemaA}".users WHERE email = $1`,
    [`secret@${slugA}.test`],
  );
  qualifiedLeak.length === 0
    ? pass('qualified-read-isolation', 'forced RLS blocked read')
    : fail('qualified-read-isolation', 'qualified data leaked');

  try {
    await sqlB.unsafe(
      `INSERT INTO "${schemaA}".users
        (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, 'Cross Tenant', '$pending$', 'active')`,
      [tenantB, `cross@${slugB}.test`],
    );
    fail('qualified-write-isolation', 'cross-schema insert succeeded');
  } catch {
    pass('qualified-write-isolation', 'forced RLS blocked write');
  }

  const base = process.env.BASE_URL;
  if (base) {
    const health = await fetch(`${base}/api/v1/health`);
    health.ok ? pass('http-health', String(health.status)) : fail('http-health', String(health.status));

    const ready = await fetch(`${base}/api/v1/health/ready`);
    ready.ok ? pass('http-ready', String(ready.status)) : fail('http-ready', String(ready.status));

    const platformLogin = await fetch(`${base}/api/v1/platform/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: PLATFORM_SUPER_ADMIN.email,
        password: PLATFORM_SUPER_ADMIN.password,
      }),
    });
    const platformCookies = (platformLogin.headers.getSetCookie?.() || [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    platformLogin.ok && platformCookies.includes('access_token')
      ? pass('http-platform-login', PLATFORM_SUPER_ADMIN.email)
      : fail('http-platform-login', await platformLogin.text());

    const list = await fetch(`${base}/api/v1/platform/tenants`, {
      headers: { cookie: platformCookies },
    });
    const listJson = await list.json();
    list.ok && Array.isArray(listJson.data)
      ? pass('http-list-tenants', `${listJson.data.length} tenants`)
      : fail('http-list-tenants', JSON.stringify(listJson));

    const createSlug = `e2e-api-${stamp}`;
    const adminEmail = `admin@${createSlug}.test`;
    const created = await fetch(`${base}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: platformCookies,
        'idempotency-key': `e2e-create:${createSlug}`,
      },
      body: JSON.stringify({
        name: 'E2E API Tenant',
        slug: createSlug,
        adminEmail,
        adminName: 'E2E Admin',
      }),
    });
    const createdJson = await created.json();
    if (created.status === 201 && createdJson.data?.id) {
      pass('http-create-tenant', `${createdJson.data.id} ${createdJson.data.schema_name}`);
      const createdId = createdJson.data.id;
      const createdSchema = createdJson.data.schema_name;
      if (!/^tenant_[0-9a-f]{32}$/.test(createdSchema)) {
        fail('http-immutable-schema', createdSchema);
      } else {
        pass('http-immutable-schema', createdSchema);
      }

      let detail;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const response = await fetch(`${base}/api/v1/platform/tenants/${createdId}`, {
          headers: { cookie: platformCookies },
        });
        detail = await response.json();
        if (detail.data?.status === 'active' || detail.data?.status === 'failed') break;
      }
      detail?.data?.status === 'active'
        ? pass('http-provision-state-machine', detail.data.provisioningJobs?.[0]?.current_step)
        : fail('http-provision-state-machine', JSON.stringify(detail));

      await rollbackTenantProvisioning(createdSchema, createdId);
      await cp`DELETE FROM provisioning_jobs WHERE tenant_id = ${createdId}`;
      await cp`DELETE FROM tenant_channels WHERE tenant_id = ${createdId}`;
      await cp`DELETE FROM tenants WHERE id = ${createdId}`;
    } else {
      fail('http-create-tenant', JSON.stringify(createdJson));
    }
  } else {
    pass('http-skipped', 'BASE_URL not set');
  }

  await rollbackTenantProvisioning(schemaA, tenantA);
  await rollbackTenantProvisioning(schemaB, tenantB);
  await cp`DELETE FROM tenant_channels WHERE tenant_id IN (${tenantA}, ${tenantB})`;
  await cp`DELETE FROM provisioning_jobs WHERE tenant_id IN (${tenantA}, ${tenantB})`;
  await cp`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`;
  pass('cleanup', 'test tenants removed');
  await closeDb();

  const failed = results.filter((result) => !result.ok);
  console.log('\n=== PRD §5 Multi-tenancy E2E ===');
  for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.name}: ${result.detail}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
