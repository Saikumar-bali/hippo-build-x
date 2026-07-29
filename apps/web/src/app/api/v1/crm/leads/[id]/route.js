import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, getTenantContext } from '@/lib/api-utils';

export async function GET(request, { params }) {
  try {
    const { tenantId } = await getTenantContext(request);
    const { id } = await params;
    const lead = await queryOne(
      `SELECT l.*, u.name as assigned_to_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
       WHERE l.id = $1 AND l.tenant_id = $2 AND l.deleted_at IS NULL`,
      [id, tenantId],
    );
    if (!lead) return errorResponse('Lead not found', 404, 'NOT_FOUND');
    return successResponse(lead);
  } catch (error) {
    return errorResponse(error.message);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { tenantId } = await getTenantContext(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await queryOne('SELECT * FROM leads WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL', [id, tenantId]);
    if (!existing) return errorResponse('Lead not found', 404, 'NOT_FOUND');

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of ['name', 'email', 'phone', 'status', 'pipeline_stage', 'notes', 'assigned_to']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(body[key]);
      }
    }

    if (fields.length === 0) return errorResponse('No fields to update', 400, 'VALIDATION_ERROR');

    fields.push('updated_at = NOW()');
    values.push(id);

    const updated = await queryOne(
      `UPDATE leads SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    return successResponse(updated);
  } catch (error) {
    return errorResponse(error.message);
  }
}
