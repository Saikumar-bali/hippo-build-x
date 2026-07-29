import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { hashPassword } from '@/lib/auth';
import { AppError, ErrorCode } from '@hippo/shared';
import { Permission } from '@hippo/rbac';

export const GET = withApiHandler(
  { auth: true, permission: Permission.USER_READ },
  async () => {
    const sql = tenantSql();
    const users = await sql.unsafe(`
      SELECT u.id, u.name, u.email, u.status, u.created_at,
             COALESCE(
               json_agg(
                 DISTINCT jsonb_build_object(
                   'roleId', r.id,
                   'roleName', r.name,
                   'projectId', ur.project_id,
                   'locationId', ur.location_id
                 )
               ) FILTER (WHERE r.id IS NOT NULL),
               '[]'
             ) AS assignments
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.deleted_at IS NULL
      LEFT JOIN roles r ON ur.role_id = r.id AND r.deleted_at IS NULL
      WHERE u.deleted_at IS NULL
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return successResponse(users);
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.USER_CREATE,
    audit: { action: 'create', entityType: 'user' },
  },
  async (request) => {
    const ctx = requireAuthContext();
    const body = await parseBody(request);
    const { name, email, password, roleId, projectId, locationId, status } = body;
    if (!name || !email || !password) {
      throw AppError.validation('name, email, and password are required');
    }

    const sql = tenantSql();
    const existing = await sql.unsafe(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email],
    );
    if (existing.length) {
      throw new AppError(ErrorCode.ALREADY_EXISTS, 'Email already exists', 409);
    }

    const passwordHash = await hashPassword(password);
    const [user] = await sql.unsafe(
      `INSERT INTO users (tenant_id, email, name, password_hash, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, status, created_at`,
      [ctx.tenantId, email, name, passwordHash, status || 'active', ctx.userId],
    );

    if (roleId) {
      await sql.unsafe(
        `INSERT INTO user_roles (tenant_id, user_id, role_id, project_id, location_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ctx.tenantId, user.id, roleId, projectId || null, locationId || null, ctx.userId],
      );
    }

    return successResponse(user, {}, 201);
  },
);
