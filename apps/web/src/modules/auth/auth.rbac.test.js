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
} from '@hippo/db';
import {
  loginWithPassword,
  rotateRefreshToken,
  loadUserAuthz,
} from './session-service.js';
import { verifyAccessToken } from '@/lib/auth.js';
import { enforceNotAuditorWrite, enforcePermission, canAccessRecord, Permission } from '@hippo/rbac';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Phase 1 auth + locked tenant routing', () => {
  const stamp = Date.now();
  const tenantId = crypto.randomUUID();
  const slug = `p1-${stamp}`;
  const schemaName = toTenantSchemaName(tenantId);

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const cp = createControlPlaneSql();
    await cp`
      INSERT INTO tenants (id, name, slug, schema_name, status, isolation_mode)
      VALUES (${tenantId}, 'P1 Tenant', ${slug}, ${schemaName},
              ${TENANT_STATUS.PROVISIONING}, 'shared_schema')
    `;
    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Admin',
      password: 'Admin@12345',
    });
  }, 120000);

  afterAll(async () => {
    try {
      await rollbackTenantProvisioning(schemaName, tenantId);
      const cp = createControlPlaneSql();
      await cp`DELETE FROM tenant_channels WHERE tenant_id = ${tenantId}`;
      await cp`DELETE FROM tenants WHERE id = ${tenantId}`;
    } finally {
      await closeDb();
    }
  });

  it('rejects invalid passwords without leaking account existence', async () => {
    for (const email of [`admin@${slug}.test`, 'nobody@example.com']) {
      await expect(loginWithPassword({ slug, email, password: 'wrong-password' })).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid credentials',
      });
    }
  });

  it('issues identity-only tokens and rejects refresh reuse', async () => {
    const session = await loginWithPassword({
      slug,
      email: `admin@${slug}.test`,
      password: 'Admin@12345',
    });
    const payload = await verifyAccessToken(session.accessToken);
    expect(payload).toMatchObject({ sub: session.user.id, tenantId, scope: 'tenant' });
    expect(payload.schemaName).toBeUndefined();
    expect(payload.permissions).toBeUndefined();
    expect(session.refreshToken).not.toContain(schemaName);

    const rotated = await rotateRefreshToken(session.refreshToken);
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
    await expect(rotateRefreshToken(session.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('denies suspended users immediately', async () => {
    const sql = createTenantSql(schemaName, tenantId);
    await sql.unsafe(`UPDATE users SET status = 'suspended' WHERE email = $1`, [
      `admin@${slug}.test`,
    ]);
    await expect(
      loginWithPassword({
        slug,
        email: `admin@${slug}.test`,
        password: 'Admin@12345',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await sql.unsafe(`UPDATE users SET status = 'active' WHERE email = $1`, [
      `admin@${slug}.test`,
    ]);
  });

  it('keeps auditor writes denied', async () => {
    const sql = createTenantSql(schemaName, tenantId);
    const [role] = await sql.unsafe(`SELECT id FROM roles WHERE name = 'Auditor'`);
    const [auditor] = await sql.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, 'Auditor', '$pending$', 'active') RETURNING id`,
      [tenantId, `auditor@${slug}.test`],
    );
    await sql.unsafe(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, auditor.id, role.id],
    );

    const authz = await loadUserAuthz(schemaName, auditor.id, tenantId);
    expect(() =>
      enforceNotAuditorWrite({ roles: authz.roles, permissions: authz.permissions }, 'POST'),
    ).toThrow();
    enforcePermission(
      { permissions: authz.permissions, roles: authz.roles },
      Permission.AUDIT_READ,
    );
  });

  it('enforces project and location scopes', async () => {
    const sql = createTenantSql(schemaName, tenantId);
    const [project] = await sql.unsafe(`SELECT id FROM projects WHERE code = 'GVR'`);
    const [location] = await sql.unsafe(`SELECT id FROM locations WHERE code = 'TOWER-A'`);
    const [role] = await sql.unsafe(`SELECT id FROM roles WHERE name = 'Site Engineer'`);
    const [meera] = await sql.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, 'Meera', '$pending$', 'active') RETURNING id`,
      [tenantId, `meera@${slug}.test`],
    );
    await sql.unsafe(
      `INSERT INTO user_roles (tenant_id, user_id, role_id, project_id, location_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, meera.id, role.id, project.id, location.id],
    );

    const authz = await loadUserAuthz(schemaName, meera.id, tenantId);
    expect(
      canAccessRecord(
        { roles: authz.roles, projectIds: authz.projectIds, locationIds: authz.locationIds },
        { project_id: project.id, location_id: location.id },
      ),
    ).toBe(true);
    expect(
      canAccessRecord(
        { roles: authz.roles, projectIds: authz.projectIds, locationIds: authz.locationIds },
        { project_id: '00000000-0000-0000-0000-000000000099', location_id: location.id },
      ),
    ).toBe(false);
  });
});
