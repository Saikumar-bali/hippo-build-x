import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError, ErrorCode } from '@hippo/shared';
import { Permission } from '@hippo/rbac';

export const GET = withApiHandler(
  { auth: true, permission: Permission.ROLE_READ },
  async () => {
    const sql = tenantSql();
    const roles = await sql.unsafe(
      `SELECT id, name, description, permissions, is_system, created_at
       FROM roles WHERE deleted_at IS NULL ORDER BY name`,
    );
    return successResponse(roles);
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.ROLE_CREATE,
    audit: { action: 'create', entityType: 'role' },
  },
  async (request) => {
    const ctx = requireAuthContext();
    const body = await parseBody(request);
    const { name, description, permissions } = body;
    if (!name) throw AppError.validation('name is required');
    const sql = tenantSql();
    const existing = await sql.unsafe(
      `SELECT id FROM roles WHERE name = $1 AND deleted_at IS NULL`,
      [name],
    );
    if (existing.length) throw new AppError(ErrorCode.ALREADY_EXISTS, 'Role exists', 409);

    const [role] = await sql.unsafe(
      `INSERT INTO roles (tenant_id, name, description, permissions, is_system, created_by)
       VALUES ($1, $2, $3, $4::jsonb, false, $5)
       RETURNING id, name, description, permissions, is_system`,
      [ctx.tenantId, name, description || null, JSON.stringify(permissions || []), ctx.userId],
    );
    return successResponse(role, {}, 201);
  },
);
