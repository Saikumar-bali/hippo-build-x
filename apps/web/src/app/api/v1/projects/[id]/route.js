import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError, ErrorCode } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.PROJECT_READ },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    const rows = await sql.unsafe(
      `SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!rows[0]) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);
    return successResponse(rows[0]);
  },
);

export const PATCH = withApiHandler(
  {
    auth: true,
    permission: Permission.PROJECT_UPDATE,
    audit: { action: 'update', entityType: 'project' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    const sql = tenantSql();
    const fields = [];
    const values = [];
    let i = 1;
    for (const key of [
      'name',
      'code',
      'description',
      'status',
      'start_date',
      'end_date',
      'budget',
      'address',
      'city',
      'state',
    ]) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${i++}`);
        values.push(body[key]);
      }
    }
    if (!fields.length) throw AppError.validation('No fields to update');
    fields.push(`updated_at = NOW()`);
    fields.push(`updated_by = $${i++}`);
    values.push(ctx.userId);
    values.push(id);
    const [row] = await sql.unsafe(
      `UPDATE projects SET ${fields.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'Project not found', 404);
    return successResponse(row);
  },
);

export const DELETE = withApiHandler(
  {
    auth: true,
    permission: Permission.PROJECT_DELETE,
    audit: { action: 'delete', entityType: 'project' },
  },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    await sql.unsafe(
      `UPDATE projects SET deleted_at = NOW(), updated_at = NOW(), updated_by = $1 WHERE id = $2`,
      [ctx.userId, id],
    );
    return successResponse({ ok: true });
  },
);
