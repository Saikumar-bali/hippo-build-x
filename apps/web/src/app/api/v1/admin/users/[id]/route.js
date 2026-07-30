import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { hashPassword } from '@/lib/auth';
import { AppError, ErrorCode } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { revokeAllUserSessions } from '@/modules/auth/session-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.USER_READ },
  async (_request, context) => {
    const { id } = await context.params;
    const sql = tenantSql();
    const rows = await sql.unsafe(
      `SELECT id, name, email, status, created_at, updated_at FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!rows[0]) throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);
    const assignments = await sql.unsafe(
      `SELECT ur.id, ur.role_id, r.name as role_name, ur.project_id, ur.location_id
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND ur.deleted_at IS NULL`,
      [id],
    );
    return successResponse({ ...rows[0], assignments });
  },
);

export const PATCH = withApiHandler(
  {
    auth: true,
    permission: Permission.USER_UPDATE,
    audit: { action: 'update', entityType: 'user' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    const body = await parseBody(request);
    const sql = tenantSql();

    const existing = await sql.unsafe(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, 'User not found', 404);

    const fields = [];
    const values = [];
    let idx = 1;
    for (const key of ['name', 'email', 'status']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(body[key]);
      }
    }
    if (body.password) {
      fields.push(`password_hash = $${idx++}`);
      values.push(await hashPassword(body.password));
    }
    if (!fields.length && !body.roleId) {
      throw AppError.validation('No fields to update');
    }

    if (fields.length) {
      fields.push('updated_at = NOW()');
      fields.push(`updated_by = $${idx++}`);
      values.push(ctx.userId);
      values.push(id);
      await sql.unsafe(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id`,
        values,
      );
    }

    if (body.status === 'suspended' || body.status === 'inactive') {
      await revokeAllUserSessions(ctx.schemaName, ctx.tenantId, id);
    }

    if (body.roleId) {
      await sql.unsafe(
        `UPDATE user_roles SET deleted_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL`,
        [id],
      );
      await sql.unsafe(
        `INSERT INTO user_roles (tenant_id, user_id, role_id, project_id, location_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ctx.tenantId,
          id,
          body.roleId,
          body.projectId || null,
          body.locationId || null,
          ctx.userId,
        ],
      );
    }

    const [user] = await sql.unsafe(
      `SELECT id, name, email, status, updated_at FROM users WHERE id = $1`,
      [id],
    );
    return successResponse(user);
  },
);

export const DELETE = withApiHandler(
  {
    auth: true,
    permission: Permission.USER_DELETE,
    audit: { action: 'delete', entityType: 'user' },
  },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    const sql = tenantSql();
    await sql.unsafe(
      `UPDATE users SET deleted_at = NOW(), status = 'inactive', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await revokeAllUserSessions(ctx.schemaName, ctx.tenantId, id);
    return successResponse({ ok: true });
  },
);
