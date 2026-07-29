import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError, ErrorCode } from '@hippo/shared';
import { Permission } from '@hippo/rbac';

export const PATCH = withApiHandler(
  {
    auth: true,
    permission: Permission.ROLE_UPDATE,
    audit: { action: 'update', entityType: 'role' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    const body = await parseBody(request);
    const sql = tenantSql();
    const existing = await sql.unsafe(
      `SELECT * FROM roles WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, 'Role not found', 404);
    if (existing[0].is_system && body.permissions === undefined && body.name) {
      throw AppError.validation('Cannot rename system roles');
    }

    const fields = [];
    const values = [];
    let idx = 1;
    if (body.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(body.description);
    }
    if (body.permissions !== undefined) {
      fields.push(`permissions = $${idx++}::jsonb`);
      values.push(JSON.stringify(body.permissions));
    }
    if (body.name !== undefined && !existing[0].is_system) {
      fields.push(`name = $${idx++}`);
      values.push(body.name);
    }
    if (!fields.length) throw AppError.validation('No fields to update');
    fields.push('updated_at = NOW()');
    fields.push(`updated_by = $${idx++}`);
    values.push(ctx.userId);
    values.push(id);

    const [role] = await sql.unsafe(
      `UPDATE roles SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, description, permissions, is_system`,
      values,
    );
    return successResponse(role);
  },
);
