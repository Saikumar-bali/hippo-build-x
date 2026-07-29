import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runControlPlaneMigrations,
  provisionTenantSchema,
  runTenantMigrations,
  rollbackTenantProvisioning,
  toSchemaName,
  closeDb,
  getSql,
  createTenantSql,
  TENANT_STATUS,
} from '../src/index.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('control plane migrations', () => {
  beforeAll(async () => {
    await runControlPlaneMigrations();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('is idempotent when re-run', async () => {
    const first = await runControlPlaneMigrations();
    const second = await runControlPlaneMigrations();
    expect(second.applied).toEqual([]);
    expect(first.total).toBeGreaterThan(0);
  });

  it('creates tenants table in public', async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tenants'
    `;
    expect(rows.length).toBe(1);
  });
});

describe.skipIf(!hasDb)('tenant provisioning', () => {
  const slug = `test-${Date.now()}`;
  const schemaName = toSchemaName(slug);
  let tenantId;

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const sql = getSql();
    const [tenant] = await sql`
      INSERT INTO tenants (name, slug, schema_name, status)
      VALUES (${'Test Tenant'}, ${slug}, ${schemaName}, ${TENANT_STATUS.PROVISIONING})
      RETURNING id
    `;
    tenantId = tenant.id;
  });

  afterAll(async () => {
    try {
      if (tenantId) {
        await rollbackTenantProvisioning(schemaName, tenantId);
        const sql = getSql();
        await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
      }
    } finally {
      await closeDb();
    }
  });

  it('provisions schema with base tables and admin', async () => {
    const result = await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Test Admin',
    });
    expect(result.status).toBe(TENANT_STATUS.ACTIVE);

    const sql = getSql();
    const schemas = await sql`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name = ${schemaName}
    `;
    expect(schemas.length).toBe(1);

    const tenantSql = createTenantSql(schemaName);
    const users = await tenantSql.unsafe(
      `SELECT email FROM users WHERE email = $1`,
      [`admin@${slug}.test`],
    );
    expect(users.length).toBe(1);

    const [row] = await sql`SELECT status FROM tenants WHERE id = ${tenantId}`;
    expect(row.status).toBe(TENANT_STATUS.ACTIVE);
  });

  it('re-running provision is idempotent', async () => {
    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Test Admin',
    });
    const tenantSql = createTenantSql(schemaName);
    const users = await tenantSql.unsafe(
      `SELECT email FROM users WHERE email = $1`,
      [`admin@${slug}.test`],
    );
    expect(users.length).toBe(1);

    const migrations = await getSql()`
      SELECT migration_name FROM tenant_migrations WHERE tenant_id = ${tenantId}
    `;
    const names = migrations.map((m) => m.migration_name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('migration re-run applies nothing new', async () => {
    const result = await runTenantMigrations(schemaName, tenantId);
    expect(result.applied).toEqual([]);
  });
});
