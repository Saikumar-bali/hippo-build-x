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

/**
 * Seed default roles, settings, admin, demo project/location, and Meera.
 * @param {string} schemaName
 * @param {string} tenantId
 * @param {{ email?: string, name?: string, password?: string, passwordHash?: string }} [admin]
 */
export async function seedTenantDefaults(schemaName, tenantId, admin = {}) {
  assertSafeSchemaName(schemaName);
  const sql = getSql();
  const email = admin.email || 'admin@example.com';
  const name = admin.name || 'Tenant Administrator';
  const password = admin.password || 'Admin@12345';
  const passwordHash = admin.passwordHash || (await hashPassword(password));

  const roleIds = {};

  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`);

    for (const role of SYSTEM_ROLES) {
      const existing = await tx.unsafe(
        `SELECT id FROM roles WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
        [role.name],
      );
      if (existing.length === 0) {
        const [row] = await tx.unsafe(
          `INSERT INTO roles (tenant_id, name, description, permissions, is_system)
           VALUES ($1, $2, $3, $4::jsonb, true)
           RETURNING id`,
          [tenantId, role.name, role.description, JSON.stringify(role.permissions)],
        );
        roleIds[role.key] = row.id;
      } else {
        roleIds[role.key] = existing[0].id;
        await tx.unsafe(
          `UPDATE roles SET permissions = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(role.permissions), existing[0].id],
        );
      }
    }

    const settings = await tx.unsafe(
      `SELECT id FROM tenant_settings WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [tenantId],
    );
    if (settings.length === 0) {
      await tx.unsafe(
        `INSERT INTO tenant_settings (tenant_id, branding, feature_flags)
         VALUES ($1, $2::jsonb, $3::jsonb)`,
        [
          tenantId,
          JSON.stringify({
            primaryColor: '#1677ff',
            appName: 'Hippo Build X',
            logoUrl: null,
          }),
          JSON.stringify({ crm: true, progress: true }),
        ],
      );
    }

    let adminId;
    const existingAdmin = await tx.unsafe(
      `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
      [email],
    );
    if (existingAdmin.length === 0) {
      const [user] = await tx.unsafe(
        `INSERT INTO users (tenant_id, email, name, password_hash, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING id`,
        [tenantId, email, name, passwordHash],
      );
      adminId = user.id;
    } else {
      adminId = existingAdmin[0].id;
      await tx.unsafe(
        `UPDATE users SET password_hash = $1, name = $2, status = 'active', updated_at = NOW()
         WHERE id = $3`,
        [passwordHash, name, adminId],
      );
    }

    const adminRoleLink = await tx.unsafe(
      `SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [adminId, roleIds.admin],
    );
    if (adminRoleLink.length === 0) {
      await tx.unsafe(
        `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
        [tenantId, adminId, roleIds.admin],
      );
    }

    // Demo project + location for RBAC scope E2E
    let projectId;
    const projects = await tx.unsafe(
      `SELECT id FROM projects WHERE code = 'GVR' AND deleted_at IS NULL LIMIT 1`,
    );
    if (projects.length === 0) {
      const [project] = await tx.unsafe(
        `INSERT INTO projects (tenant_id, name, code, status, description)
         VALUES ($1, 'Green Valley Residency', 'GVR', 'active', 'Demo project')
         RETURNING id`,
        [tenantId],
      );
      projectId = project.id;
    } else {
      projectId = projects[0].id;
    }

    let locationId;
    const locations = await tx.unsafe(
      `SELECT id FROM locations WHERE code = 'TOWER-A' AND deleted_at IS NULL LIMIT 1`,
    );
    if (locations.length === 0) {
      const [loc] = await tx.unsafe(
        `INSERT INTO locations (tenant_id, project_id, name, code, status)
         VALUES ($1, $2, 'Tower A', 'TOWER-A', 'active')
         RETURNING id`,
        [tenantId, projectId],
      );
      locationId = loc.id;
    } else {
      locationId = locations[0].id;
    }

    // Phase 2 demo hierarchy (tables exist after migration 003+)
    if (admin.seedDemoUsers) {
      try {
        let blockId;
        const blocks = await tx.unsafe(
          `SELECT id FROM blocks WHERE project_id = $1 AND code = 'BLK-A' AND deleted_at IS NULL LIMIT 1`,
          [projectId],
        );
        if (blocks.length === 0) {
          const [block] = await tx.unsafe(
            `INSERT INTO blocks (tenant_id, project_id, name, code)
             VALUES ($1, $2, 'Block A', 'BLK-A') RETURNING id`,
            [tenantId, projectId],
          );
          blockId = block.id;
        } else {
          blockId = blocks[0].id;
        }

        let towerAId;
        const towers = await tx.unsafe(
          `SELECT id FROM towers WHERE project_id = $1 AND code = 'TOWER-A' AND deleted_at IS NULL LIMIT 1`,
          [projectId],
        );
        if (towers.length === 0) {
          const [tower] = await tx.unsafe(
            `INSERT INTO towers (tenant_id, project_id, block_id, name, code, floors_planned)
             VALUES ($1, $2, $3, 'Tower A', 'TOWER-A', 10) RETURNING id`,
            [tenantId, projectId, blockId],
          );
          towerAId = tower.id;
        } else {
          towerAId = towers[0].id;
        }

        const towerB = await tx.unsafe(
          `SELECT id FROM towers WHERE project_id = $1 AND code = 'TOWER-B' AND deleted_at IS NULL LIMIT 1`,
          [projectId],
        );
        if (towerB.length === 0) {
          await tx.unsafe(
            `INSERT INTO towers (tenant_id, project_id, block_id, name, code, floors_planned)
             VALUES ($1, $2, $3, 'Tower B', 'TOWER-B', 10)`,
            [tenantId, projectId, blockId],
          );
        }

        for (const n of [1, 2]) {
          const fl = await tx.unsafe(
            `SELECT id FROM floors WHERE tower_id = $1 AND floor_number = $2 AND deleted_at IS NULL LIMIT 1`,
            [towerAId, n],
          );
          if (fl.length === 0) {
            await tx.unsafe(
              `INSERT INTO floors (tenant_id, project_id, tower_id, floor_number, name)
               VALUES ($1, $2, $3, $4, $5)`,
              [tenantId, projectId, towerAId, n, `Floor ${n}`],
            );
          }
        }

        for (const cat of [
          { code: '2BHK', name: '2 BHK', bedrooms: 2, bathrooms: 2 },
          { code: '3BHK', name: '3 BHK', bedrooms: 3, bathrooms: 3 },
        ]) {
          const existing = await tx.unsafe(
            `SELECT id FROM unit_categories WHERE project_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
            [projectId, cat.code],
          );
          if (existing.length === 0) {
            await tx.unsafe(
              `INSERT INTO unit_categories (tenant_id, project_id, name, code, bedrooms, bathrooms)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [tenantId, projectId, cat.name, cat.code, cat.bedrooms, cat.bathrooms],
            );
          }
        }
      } catch {
        // Older schemas without Phase 2 tables — skip hierarchy seed
      }
    }

    // Meera — site engineer scoped to GVR / Tower A (demo seed only)
    if (admin.seedDemoUsers) {
      const meeraEmail = 'meera@greenvalley.example';
      const meeraHash = await hashPassword('Meera@12345');
      let meeraId;
      const meeraRows = await tx.unsafe(
        `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
        [meeraEmail],
      );
      if (meeraRows.length === 0) {
        const [meera] = await tx.unsafe(
          `INSERT INTO users (tenant_id, email, name, password_hash, status)
           VALUES ($1, $2, 'Meera', $3, 'active')
           RETURNING id`,
          [tenantId, meeraEmail, meeraHash],
        );
        meeraId = meera.id;
      } else {
        meeraId = meeraRows[0].id;
        await tx.unsafe(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [meeraHash, meeraId],
        );
      }

      const meeraRole = await tx.unsafe(
        `SELECT id FROM user_roles
         WHERE user_id = $1 AND role_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [meeraId, roleIds['site-engineer']],
      );
      if (meeraRole.length === 0) {
        await tx.unsafe(
          `INSERT INTO user_roles (tenant_id, user_id, role_id, project_id, location_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, meeraId, roleIds['site-engineer'], projectId, locationId],
        );
      } else {
        await tx.unsafe(
          `UPDATE user_roles SET project_id = $1, location_id = $2, updated_at = NOW()
           WHERE id = $3`,
          [projectId, locationId, meeraRole[0].id],
        );
      }
    }
  });

  await sql.unsafe(`SET search_path TO public`);
  return { email, name, password };
}
