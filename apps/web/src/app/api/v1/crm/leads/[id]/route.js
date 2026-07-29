import { successResponse, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireTenantContext } from '@/lib/tenant-context.js';
import { AppError, ErrorCode } from '@hippo/shared';

export const GET = withApiHandler(async (_request, context) => {
  const { tenantId } = requireTenantContext();
  const { id } = await context.params;
  const sql = tenantSql();
  try {
    const rows = await sql.unsafe(
      `SELECT l.*, u.name as assigned_to_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
       WHERE l.id = $1 AND l.tenant_id = $2 AND l.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!rows[0]) throw new AppError(ErrorCode.NOT_FOUND, 'Lead not found', 404);
    return successResponse(rows[0]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (String(error.message).includes('does not exist')) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Lead not found', 404);
    }
    throw error;
  }
});

export const PATCH = withApiHandler(async (request, context) => {
  const { tenantId } = requireTenantContext();
  const { id } = await context.params;
  const body = await request.json();
  const sql = tenantSql();

  const existing = await sql.unsafe(
    'SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenantId],
  );
  if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, 'Lead not found', 404);

  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of ['name', 'email', 'phone', 'status', 'pipeline_stage', 'notes', 'assigned_to']) {
    if (body[key] !== undefined) {
      fields.push(`${key} = $${idx++}`);
      values.push(body[key]);
    }
  }

  if (fields.length === 0) throw AppError.validation('No fields to update');

  fields.push('updated_at = NOW()');
  values.push(id);

  const updated = await sql.unsafe(
    `UPDATE leads SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
    values,
  );
  return successResponse(updated[0]);
});
