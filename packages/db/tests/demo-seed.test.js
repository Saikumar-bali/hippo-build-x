import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TENANT_STATUS,
  closeDb,
  createControlPlaneSql,
  createTenantSql,
  provisionTenantSchema,
  rollbackTenantProvisioning,
  runControlPlaneMigrations,
  toTenantSchemaName,
} from '../src/index.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Phase 2 demonstration seed', () => {
  const tenantId = crypto.randomUUID();
  const schemaName = toTenantSchemaName(tenantId);
  const slug = `demo-seed-${Date.now()}`;

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const cp = createControlPlaneSql();
    await cp`
      INSERT INTO tenants (id, name, slug, schema_name, status, isolation_mode)
      VALUES (${tenantId}, 'Demo Seed Tenant', ${slug}, ${schemaName},
              ${TENANT_STATUS.PROVISIONING}, 'shared_schema')
    `;
    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Demo Seed Admin',
      seedDemoUsers: true,
    });
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

  it('creates floors 1 and 2 for Tower A idempotently', async () => {
    const tenantSql = createTenantSql(schemaName, tenantId);
    const floors = await tenantSql.unsafe(
      `SELECT f.floor_number, f.name
       FROM floors f
       JOIN towers t ON t.id = f.tower_id
       WHERE t.code = 'TOWER-A'
         AND t.deleted_at IS NULL
         AND f.deleted_at IS NULL
       ORDER BY f.floor_number`,
    );

    expect(floors).toEqual([
      { floor_number: 1, name: 'Floor 1' },
      { floor_number: 2, name: 'Floor 2' },
    ]);

    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Demo Seed Admin',
      seedDemoUsers: true,
    });

    const repeated = await tenantSql.unsafe(
      `SELECT floor_number, COUNT(*)::int AS count
       FROM floors
       WHERE tower_id = (SELECT id FROM towers WHERE code = 'TOWER-A' LIMIT 1)
         AND deleted_at IS NULL
       GROUP BY floor_number
       ORDER BY floor_number`,
    );
    expect(repeated).toEqual([
      { floor_number: 1, count: 1 },
      { floor_number: 2, count: 1 },
    ]);
  });
});
