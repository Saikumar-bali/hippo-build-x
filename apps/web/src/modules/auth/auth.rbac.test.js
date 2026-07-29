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
} from '@hippo/db';
import {
  loginWithPassword,
  rotateRefreshToken,
  loadUserAuthz,
} from './session-service.js';
import { enforceNotAuditorWrite, enforcePermission, canAccessRecord, Permission } from '@hippo/rbac';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Phase 1 auth + RBAC', () => {
  const stamp = Date.now();
  const slug = `p1-${stamp}`;
  const schemaName = toSchemaName(slug);
  let tenantId;

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const sql = getSql();
    const [tenant] = await sql`
      INSERT INTO tenants (name, slug, schema_name, status)
      VALUES (${'P1 Tenant'}, ${slug}, ${schemaName}, ${TENANT_STATUS.PROVISIONING})
      RETURNING id
    `;
    tenantId = tenant.id;
    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      adminName: 'Admin',
      password: 'Admin@12345',
    });
  }, 120000);

  afterAll(async () => {
    try {
      if (tenantId) {
        await rollbackTenantProvisioning(schemaName, tenantId);
        await getSql()`DELETE FROM tenants WHERE id = ${tenantId}`;
      }
    } finally {
      await closeDb();
    }
  });

  it('rejects invalid password without leaking existence', async () => {
    await expect(
      loginWithPassword({
        slug,
        email: `admin@${slug}.test`,
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });

    await expect(
      loginWithPassword({
        slug,
        email: 'nobody@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
  });

  it('logs in and rotates refresh; reuse is rejected', async () => {
    const session = await loginWithPassword({
      slug,
      email: `admin@${slug}.test`,
      password: 'Admin@12345',
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toContain(schemaName);

    const rotated = await rotateRefreshToken(session.refreshToken);
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.refreshToken).not.toBe(session.refreshToken);

    await expect(rotateRefreshToken(session.refreshToken)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('denies suspended users', async () => {
    const sql = createTenantSql(schemaName);
    await sql.unsafe(
      `UPDATE users SET status = 'suspended' WHERE email = $1`,
      [`admin@${slug}.test`],
    );
    await expect(
      loginWithPassword({
        slug,
        email: `admin@${slug}.test`,
        password: 'Admin@12345',
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    await sql.unsafe(
      `UPDATE users SET status = 'active' WHERE email = $1`,
      [`admin@${slug}.test`],
    );
  });

  it('auditor cannot write', async () => {
    const sql = createTenantSql(schemaName);
    const roles = await sql.unsafe(`SELECT id FROM roles WHERE name = 'Auditor'`);
    const [auditor] = await sql.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, 'Auditor', '$pending$', 'active') RETURNING id`,
      [tenantId, `auditor@${slug}.test`],
    );
    await sql.unsafe(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, auditor.id, roles[0].id],
    );

    const authz = await loadUserAuthz(schemaName, auditor.id);
    expect(() =>
      enforceNotAuditorWrite(
        { roles: authz.roles, permissions: authz.permissions },
        'POST',
      ),
    ).toThrow();
    enforcePermission(
      { permissions: authz.permissions, roles: authz.roles },
      Permission.AUDIT_READ,
    );
  });

  it('site engineer is scoped to assigned project/location', async () => {
    const sql = createTenantSql(schemaName);
    const projects = await sql.unsafe(`SELECT id FROM projects WHERE code = 'GVR'`);
    const locations = await sql.unsafe(`SELECT id FROM locations WHERE code = 'TOWER-A'`);
    const roles = await sql.unsafe(`SELECT id FROM roles WHERE name = 'Site Engineer'`);

    const [meera] = await sql.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status)
       VALUES ($1, $2, 'Meera', '$pending$', 'active') RETURNING id`,
      [tenantId, `meera@${slug}.test`],
    );
    await sql.unsafe(
      `INSERT INTO user_roles (tenant_id, user_id, role_id, project_id, location_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, meera.id, roles[0].id, projects[0].id, locations[0].id],
    );

    const authz = await loadUserAuthz(schemaName, meera.id);
    expect(authz.projectIds).toContain(projects[0].id);
    expect(authz.locationIds).toContain(locations[0].id);
    expect(
      canAccessRecord(
        { roles: authz.roles, projectIds: authz.projectIds, locationIds: authz.locationIds },
        { project_id: projects[0].id, location_id: locations[0].id },
      ),
    ).toBe(true);
    expect(
      canAccessRecord(
        { roles: authz.roles, projectIds: authz.projectIds, locationIds: authz.locationIds },
        { project_id: '00000000-0000-0000-0000-000000000099', location_id: locations[0].id },
      ),
    ).toBe(false);
  });
});
