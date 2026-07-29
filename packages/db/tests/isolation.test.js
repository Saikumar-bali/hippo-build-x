import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runControlPlaneMigrations,
  provisionTenantSchema,
  rollbackTenantProvisioning,
  toSchemaName,
  closeDb,
  getSql,
  createTenantSql,
  TENANT_STATUS,
} from '../src/index.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('cross-tenant isolation', () => {
  const stamp = Date.now();
  const slugA = `iso-a-${stamp}`;
  const slugB = `iso-b-${stamp}`;
  const schemaA = toSchemaName(slugA);
  const schemaB = toSchemaName(slugB);
  let tenantA;
  let tenantB;

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const sql = getSql();

    const [a] = await sql`
      INSERT INTO tenants (name, slug, schema_name, status)
      VALUES (${'Tenant A'}, ${slugA}, ${schemaA}, ${TENANT_STATUS.PROVISIONING})
      RETURNING id
    `;
    const [b] = await sql`
      INSERT INTO tenants (name, slug, schema_name, status)
      VALUES (${'Tenant B'}, ${slugB}, ${schemaB}, ${TENANT_STATUS.PROVISIONING})
      RETURNING id
    `;
    tenantA = a.id;
    tenantB = b.id;

    await provisionTenantSchema(tenantA, schemaA, {
      adminEmail: `admin@${slugA}.test`,
    });
    await provisionTenantSchema(tenantB, schemaB, {
      adminEmail: `admin@${slugB}.test`,
    });

    const sqlA = createTenantSql(schemaA);
    await sqlA.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [tenantA, `secret@${slugA}.test`, 'Secret User A', '$pending$'],
    );
  });

  afterAll(async () => {
    try {
      if (tenantA) {
        await rollbackTenantProvisioning(schemaA, tenantA);
        const sql = getSql();
        await sql`DELETE FROM tenants WHERE id = ${tenantA}`;
      }
      if (tenantB) {
        await rollbackTenantProvisioning(schemaB, tenantB);
        const sql = getSql();
        await sql`DELETE FROM tenants WHERE id = ${tenantB}`;
      }
    } finally {
      await closeDb();
    }
  });

  it('tenant B cannot read tenant A users via search_path', async () => {
    const sqlB = createTenantSql(schemaB);
    const rows = await sqlB.unsafe(
      `SELECT email FROM users WHERE email = $1`,
      [`secret@${slugA}.test`],
    );
    expect(rows.length).toBe(0);
  });

  it('tenant A can read its own secret user', async () => {
    const sqlA = createTenantSql(schemaA);
    const rows = await sqlA.unsafe(
      `SELECT email FROM users WHERE email = $1`,
      [`secret@${slugA}.test`],
    );
    expect(rows.length).toBe(1);
  });

  it('tenant B cannot write into tenant A schema through its client', async () => {
    const sqlB = createTenantSql(schemaB);
    await sqlB.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [tenantB, `attacker@${slugB}.test`, 'Attacker', '$pending$'],
    );

    const sqlA = createTenantSql(schemaA);
    const leaked = await sqlA.unsafe(
      `SELECT email FROM users WHERE email = $1`,
      [`attacker@${slugB}.test`],
    );
    expect(leaked.length).toBe(0);
  });
});
