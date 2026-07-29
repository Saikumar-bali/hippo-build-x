import { query } from '@/lib/db';
import { successResponse, errorResponse, getTenantContext } from '@/lib/api-utils';

export async function GET(request) {
  try {
    const { tenantId } = await getTenantContext(request);
    const projects = await query(
      'SELECT * FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [tenantId],
    );
    return successResponse(projects);
  } catch (error) {
    return errorResponse(error.message);
  }
}

export async function POST(request) {
  try {
    const { tenantId, userId } = await getTenantContext(request);
    const { name, code, description, start_date, end_date, budget } = await request.json();

    if (!name || !code) return errorResponse('Name and code are required', 400, 'VALIDATION_ERROR');

    const [project] = await query(
      `INSERT INTO projects (tenant_id, name, code, description, start_date, end_date, budget, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING *`,
      [tenantId, name, code, description || null, start_date || null, end_date || null, budget || null, userId],
    );
    return successResponse(project, {}, 201);
  } catch (error) {
    return errorResponse(error.message);
  }
}
