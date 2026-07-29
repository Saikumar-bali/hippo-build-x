import { query } from '@/lib/db';
import { successResponse, errorResponse, getTenantContext } from '@/lib/api-utils';

export async function GET(request) {
  try {
    const { tenantId } = await getTenantContext(request);
    const leads = await query(`
      SELECT l.*, u.name as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
      WHERE l.tenant_id = $1 AND l.deleted_at IS NULL
      ORDER BY l.created_at DESC
    `, [tenantId]);
    return successResponse(leads);
  } catch (error) {
    return errorResponse(error.message);
  }
}

export async function POST(request) {
  try {
    const { tenantId, userId } = await getTenantContext(request);
    const { name, email, phone, source, notes } = await request.json();

    if (!name) return errorResponse('Name is required', 400, 'VALIDATION_ERROR');

    const [lead] = await query(
      `INSERT INTO leads (tenant_id, name, email, phone, source, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [tenantId, name, email || null, phone || null, source || 'direct', notes || null, userId],
    );
    return successResponse(lead, {}, 201);
  } catch (error) {
    return errorResponse(error.message);
  }
}
