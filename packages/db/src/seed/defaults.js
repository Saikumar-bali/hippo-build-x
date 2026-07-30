import { getSql } from '../client.js';
import { assertSafeSchemaName } from '../migrations/schema-name.js';
import { hashPassword } from '@hippo/shared/crypto';

const SYSTEM_ROLES = [
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Full tenant administrator',
    permissions: ['*'],
  },
  {
    key: 'auditor',
    name: 'Auditor',
    description: 'Read-only auditor',
    permissions: [
      'user.read',
      'project.read',
      'unit.read',
      'task.read',
      'crm.lead.read',
      'progress.read',
      'payment.read',
      'inventory.read',
      'audit.read',
    ],
  },
  {
    key: 'site-engineer',
    name: 'Site Engineer',
    description: 'Site progress submissions',
    permissions: [
      'project.read',
      'unit.read',
      'task.read',
      'drawing.manage',
      'rfi.manage',
      'issue.manage',
      'progress.submit',
      'progress.read',
      'inventory.read',
    ],
  },
  {
    key: 'project-manager',
    name: 'Project Manager',
    description: 'Project oversight',
    permissions: [
      'user.read',
      'project.create',
      'project.read',
      'project.update',
      'unit.create',
      'unit.read',
      'unit.update',
      'task.create',
      'task.read',
      'task.update',
      'boq.manage',
      'drawing.manage',
      'rfi.manage',
      'issue.manage',
      'crm.lead.read',
      'progress.read',
      'progress.approve',
      'payment.read',
      'inventory.read',
      'audit.read',
    ],
  },
  {
    key: 'sales-executive',
    name: 'Sales Executive',
    description: 'CRM and pipeline',
    permissions: [
      'crm.lead.create',
      'crm.lead.read',
      'crm.lead.update',
      'crm.pipeline.manage',
      'project.read',
      'unit.read',
    ],
  },
];

async function upsertRole(tx, tenantId, role) {
  const existing = await tx.unsafe(
    `SELECT id FROM roles WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
    [role.name],
  );
  if (existing[0]) {
    await tx.unsafe(
      `UPDATE roles SET description = $1, permissions = $2::jsonb, is_system = true,
       updated_at = NOW() WHERE id = $3`,
      [role.description, JSON.stringify(role.permissions), existing[0].id],
    );
    return existing[0].id;
  }
  const [created] = await tx.unsafe(
    `INSERT INTO roles (tenant_id, name, description, permissions, is_system)
     VALUES ($1, $2, $3, $4::jsonb, true) RETURNING id`,
    [tenantId, role.name, role.description, JSON.stringify(role.permissions)],
  );
  return created.id;
}

async function ensureUser(tx, { tenantId, email, name, passwordHash }) {
  const existing = await tx.unsafe(
    `SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (existing[0]) {
    await tx.unsafe(
      `UPDATE users SET name = $1, password_hash = $2, status = 'active',
       updated_at = NOW() WHERE id = $3`,
      [name, passwordHash, existing[0].id],
    );
    return existing[0].id;
  }
  const [created] = await tx.unsafe(
    `INSERT INTO users (tenant_id, email, name, password_hash, status)
     VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
    [tenantId, email, name, passwordHash],
  );
  return created.id;
}

async function ensureRoleAssignment(tx, { tenantId, userId, roleId, projectId = null, locationId = null }) {
  const existing = await tx.unsafe(
    `SELECT id FROM user_roles
     WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [userId, roleId],
  );
  if (existing[0]) {
    await tx.unsafe(
      `UPDATE user_roles SET project_id = $1, location_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [projectId, locationId, existing[0].id],
    );
    return;
  }
  await tx.unsafe(
    `INSERT INTO user_roles (tenant_id, user_id, role_id, project_id, location_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, userId, roleId, projectId, locationId],
  );
}

async function ensureProjectAndLocation(tx, tenantId) {
  let project = (
    await tx.unsafe(`SELECT id FROM projects WHERE code = 'GVR' AND deleted_at IS NULL LIMIT 1`)
  )[0];
  if (!project) {
    [project] = await tx.unsafe(
      `INSERT INTO projects (tenant_id, name, code, status, description)
       VALUES ($1, 'Green Valley Residency', 'GVR', 'active', 'Demonstration project')
       RETURNING id`,
      [tenantId],
    );
  }

  let location = (
    await tx.unsafe(`SELECT id FROM locations WHERE code = 'TOWER-A' AND deleted_at IS NULL LIMIT 1`)
  )[0];
  if (!location) {
    [location] = await tx.unsafe(
      `INSERT INTO locations (tenant_id, project_id, name, code, status)
       VALUES ($1, $2, 'Tower A', 'TOWER-A', 'active') RETURNING id`,
      [tenantId, project.id],
    );
  }
  return { projectId: project.id, locationId: location.id };
}

async function seedPhase2Demo(tx, tenantId, projectId) {
  try {
    let block = (
      await tx.unsafe(
        `SELECT id FROM blocks WHERE project_id = $1 AND code = 'BLK-A' AND deleted_at IS NULL LIMIT 1`,
        [projectId],
      )
    )[0];
    if (!block) {
      [block] = await tx.unsafe(
        `INSERT INTO blocks (tenant_id, project_id, name, code)
         VALUES ($1, $2, 'Block A', 'BLK-A') RETURNING id`,
        [tenantId, projectId],
      );
    }

    for (const code of ['TOWER-A', 'TOWER-B']) {
      const found = await tx.unsafe(
        `SELECT id FROM towers WHERE project_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
        [projectId, code],
      );
      if (!found[0]) {
        await tx.unsafe(
          `INSERT INTO towers (tenant_id, project_id, block_id, name, code, floors_planned)
           VALUES ($1, $2, $3, $4, $5, 10)`,
          [tenantId, projectId, block.id, code === 'TOWER-A' ? 'Tower A' : 'Tower B', code],
        );
      }
    }

    for (const category of [
      { code: '2BHK', name: '2 BHK', bedrooms: 2, bathrooms: 2 },
      { code: '3BHK', name: '3 BHK', bedrooms: 3, bathrooms: 3 },
    ]) {
      const found = await tx.unsafe(
        `SELECT id FROM unit_categories
         WHERE project_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
        [projectId, category.code],
      );
      if (!found[0]) {
        await tx.unsafe(
          `INSERT INTO unit_categories
            (tenant_id, project_id, name, code, bedrooms, bathrooms)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tenantId,
            projectId,
            category.name,
            category.code,
            category.bedrooms,
            category.bathrooms,
          ],
        );
      }
    }
  } catch {
    // Phase 2 tables may not exist while provisioning an older schema.
  }
}

/**
 * Seed default roles, tenant settings and the first administrator. The tenant
 * id is bound as a transaction-local PostgreSQL setting before forced RLS can
 * evaluate any insert or update.
 */
export async function seedTenantDefaults(schemaName, tenantId, admin = {}) {
  assertSafeSchemaName(schemaName);
  const sql = getSql();
  const email = admin.email || 'admin@example.com';
  const name = admin.name || 'Tenant Administrator';
  const password = admin.password || 'Admin@12345';
  const passwordHash = admin.passwordHash || (await hashPassword(password));

  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;

    const roleIds = {};
    for (const role of SYSTEM_ROLES) roleIds[role.key] = await upsertRole(tx, tenantId, role);

    const settings = await tx.unsafe(
      `SELECT id FROM tenant_settings WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tenantId],
    );
    if (!settings[0]) {
      await tx.unsafe(
        `INSERT INTO tenant_settings (tenant_id, branding, feature_flags)
         VALUES ($1, $2::jsonb, $3::jsonb)`,
        [
          tenantId,
          JSON.stringify({ primaryColor: '#1677ff', appName: 'Hippo Build X', logoUrl: null }),
          JSON.stringify({ crm: true, progress: true }),
        ],
      );
    }

    const adminId = await ensureUser(tx, { tenantId, email, name, passwordHash });
    await ensureRoleAssignment(tx, { tenantId, userId: adminId, roleId: roleIds.admin });

    const { projectId, locationId } = await ensureProjectAndLocation(tx, tenantId);
    if (admin.seedDemoUsers) {
      await seedPhase2Demo(tx, tenantId, projectId);
      const meeraId = await ensureUser(tx, {
        tenantId,
        email: 'meera@greenvalley.example',
        name: 'Meera',
        passwordHash: await hashPassword('Meera@12345'),
      });
      await ensureRoleAssignment(tx, {
        tenantId,
        userId: meeraId,
        roleId: roleIds['site-engineer'],
        projectId,
        locationId,
      });
    }
  });

  return { email, name, password };
}
