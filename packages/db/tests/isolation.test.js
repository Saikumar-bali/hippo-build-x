import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runControlPlaneMigrations,
  provisionTenantSchema,
  rollbackTenantProvisioning,
  toTenantSchemaName,
  closeDb,
  createControlPlaneSql,
  createTenantSql,
  TENANT_STATUS,
} from '../src/index.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('locked cross-tenant isolation', () => {
  const stamp = Date.now();
  const tenantA = crypto.randomUUID();
  const tenantB = crypto.randomUUID();
  const slugA = `iso-a-${stamp}`;
  const slugB = `iso-b-${stamp}`;
  const schemaA = toTenantSchemaName(tenantA);
  const schemaB = toTenantSchemaName(tenantB);

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const cp = createControlPlaneSql();
    await cp`
      INSERT INTO tenants (id, name, slug, schema_name, status, isolation_mode)
      VALUES (${tenantA}, 'Tenant A', ${slugA}, ${schemaA}, ${TENANT_STATUS.PROVISIONING}, 'shared_schema'),
             (${tenantB}, 'Tenant B', ${slugB}, ${schemaB}, ${TENANT_STATUS.PROVISIONING}, 'shared_schema')
    `;

    await provisionTenantSchema(tenantA, schemaA, { adminEmail: `admin@${slugA}.test` });
    await provisionTenantSchema(tenantB, schemaB, { adminEmail: `admin@${slugB}.test` });

    const sqlA = createTenantSql(schemaA, tenantA);
    await sqlA.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, 'Secret User A', '$pending$', 'active')`,
      [tenantA, `secret@${slugA}.test`],
    );
  }, 120000);

  afterAll(async () => {
    try {
      await rollbackTenantProvisioning(schemaA, tenantA);
      await rollbackTenantProvisioning(schemaB, tenantB);
      const cp = createControlPlaneSql();
      await cp`DELETE FROM tenant_channels WHERE tenant_id IN (${tenantA}, ${tenantB})`;
      await cp`DELETE FROM provisioning_jobs WHERE tenant_id IN (${tenantA}, ${tenantB})`;
      await cp`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`;
    } finally {
      await closeDb();
    }
  });

  it('requires an explicit tenant id for every tenant client', () => {
    expect(() => createTenantSql(schemaA)).toThrow('tenantId');
  });

  it('keeps control-plane tables outside the tenant search path', async () => {
    const sqlA = createTenantSql(schemaA, tenantA);
    await expect(sqlA.unsafe(`SELECT id FROM tenants LIMIT 1`)).rejects.toThrow();
  });

  it('tenant B cannot read tenant A through normal routing', async () => {
    const sqlB = createTenantSql(schemaB, tenantB);
    const rows = await sqlB.unsafe(`SELECT email FROM users WHERE email = $1`, [
      `secret@${slugA}.test`,
    ]);
    expect(rows).toEqual([]);
  });

  it('forced RLS blocks schema-qualified cross-tenant reads', async () => {
    const sqlB = createTenantSql(schemaB, tenantB);
    const rows = await sqlB.unsafe(
      `SELECT email FROM "${schemaA}".users WHERE email = $1`,
      [`secret@${slugA}.test`],
    );
    expect(rows).toEqual([]);
  });

  it('forced RLS blocks writing a Tenant B row into Tenant A schema', async () => {
    const sqlB = createTenantSql(schemaB, tenantB);
    await expect(
      sqlB.unsafe(
        `INSERT INTO "${schemaA}".users
          (tenant_id, email, name, password_hash, status)
         VALUES ($1, $2, 'Cross Schema B', '$pending$', 'active')`,
        [tenantB, `cross-b@${slugB}.test`],
      ),
    ).rejects.toThrow();
  });

  it('forced RLS also rejects spoofing Tenant A tenant_id from Tenant B context', async () => {
    const sqlB = createTenantSql(schemaB, tenantB);
    await expect(
      sqlB.unsafe(
        `INSERT INTO "${schemaA}".users
          (tenant_id, email, name, password_hash, status)
         VALUES ($1, $2, 'Spoofed A', '$pending$', 'active')`,
        [tenantA, `spoof-a@${slugB}.test`],
      ),
    ).rejects.toThrow();
  });

  it('tenant A still reads its own protected data', async () => {
    const sqlA = createTenantSql(schemaA, tenantA);
    const rows = await sqlA.unsafe(`SELECT email FROM users WHERE email = $1`, [
      `secret@${slugA}.test`,
    ]);
    expect(rows).toHaveLength(1);
  });
});
