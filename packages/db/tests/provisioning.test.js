import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runControlPlaneMigrations,
  provisionTenantSchema,
  runTenantMigrations,
  rollbackTenantProvisioning,
  toTenantSchemaName,
  closeDb,
  getSql,
  createControlPlaneSql,
  createTenantSql,
  TENANT_STATUS,
} from '../src/index.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('locked control plane migrations', () => {
  beforeAll(async () => runControlPlaneMigrations());
  afterAll(async () => closeDb());

  it('is idempotent and stores application tables outside public', async () => {
    const first = await runControlPlaneMigrations();
    const second = await runControlPlaneMigrations();
    expect(second.applied).toEqual([]);
    expect(first.total).toBeGreaterThan(0);

    const sql = getSql();
    const controlTables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'control_plane'
        AND table_type = 'BASE TABLE'
        AND table_name IN ('tenants', 'platform_users', 'provisioning_jobs', 'tenant_channels')
    `;
    expect(controlTables.map((row) => row.table_name).sort()).toEqual([
      'platform_users',
      'provisioning_jobs',
      'tenant_channels',
      'tenants',
    ]);

    const publicTables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name IN (
          'control_plane_migrations', 'tenants', 'platform_users', 'tenant_migrations'
        )
    `;
    expect(publicTables).toEqual([]);
  });
});

describe.skipIf(!hasDb)('tenant provisioning state', () => {
  const tenantId = crypto.randomUUID();
  const slug = `locked-${Date.now()}`;
  const schemaName = toTenantSchemaName(tenantId);

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const cp = createControlPlaneSql();
    await cp`
      INSERT INTO tenants (id, name, slug, schema_name, status, isolation_mode)
      VALUES (${tenantId}, 'Locked Tenant', ${slug}, ${schemaName},
              ${TENANT_STATUS.PROVISIONING}, 'shared_schema')
    `;
  });

  afterAll(async () => {
    try {
      await rollbackTenantProvisioning(schemaName, tenantId);
      const cp = createControlPlaneSql();
      await cp`DELETE FROM provisioning_jobs WHERE tenant_id = ${tenantId}`;
      await cp`DELETE FROM tenant_channels WHERE tenant_id = ${tenantId}`;
      await cp`DELETE FROM tenants WHERE id = ${tenantId}`;
    } finally {
      await closeDb();
    }
  });

  it('creates immutable schema, local migration ledger, admin and channel vault', async () => {
    const steps = [];
    const result = await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Locked Admin',
      onStep: (step) => steps.push(step),
    });
    expect(result.status).toBe(TENANT_STATUS.ACTIVE);
    expect(schemaName).toMatch(/^tenant_[0-9a-f]{32}$/);
    expect(steps).toEqual([
      'schema_created',
      'migrations_applied',
      'defaults_seeded',
      'channel_record_created',
      'active',
    ]);

    const tenantSql = createTenantSql(schemaName, tenantId);
    const users = await tenantSql.unsafe(
      `SELECT email FROM users WHERE email = $1`,
      [`admin@${slug}.test`],
    );
    expect(users).toHaveLength(1);

    const localMigrations = await tenantSql.unsafe(
      `SELECT migration_name, checksum FROM _tenant_migrations ORDER BY migration_name`,
    );
    expect(localMigrations.length).toBeGreaterThan(0);
    expect(localMigrations.every((row) => row.checksum?.length === 64)).toBe(true);

    const cp = createControlPlaneSql();
    const [tenant] = await cp`
      SELECT status, migration_version FROM tenants WHERE id = ${tenantId}
    `;
    expect(tenant.status).toBe(TENANT_STATUS.ACTIVE);
    expect(tenant.migration_version).toContain('999_locked_tenant_rls.sql');

    const channels = await cp`
      SELECT channel_type, encrypted_credentials, verification_status
      FROM tenant_channels WHERE tenant_id = ${tenantId}
    `;
    expect(channels).toEqual([
      {
        channel_type: 'default',
        encrypted_credentials: null,
        verification_status: 'not_configured',
      },
    ]);
  });

  it('is idempotent and validates migration checksums', async () => {
    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Locked Admin',
    });
    const tenantSql = createTenantSql(schemaName, tenantId);
    const users = await tenantSql.unsafe(
      `SELECT email FROM users WHERE email = $1`,
      [`admin@${slug}.test`],
    );
    expect(users).toHaveLength(1);

    const result = await runTenantMigrations(schemaName, tenantId);
    expect(result.applied).toEqual([]);

    const cp = createControlPlaneSql();
    const central = await cp`
      SELECT migration_name, checksum FROM tenant_migrations WHERE tenant_id = ${tenantId}
    `;
    expect(new Set(central.map((row) => row.migration_name)).size).toBe(central.length);
    expect(central.every((row) => row.checksum?.length === 64)).toBe(true);
  });
});
