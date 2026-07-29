import { query } from '@/lib/db';
import { successResponse, errorResponse, getTenantContext } from '@/lib/api-utils';

export async function GET(request) {
  try {
    const { tenantId } = await getTenantContext(request);
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const tower = searchParams.get('tower');
    const status = searchParams.get('status');

    let sql = `
      SELECT u.*, p.name as project_name, p.code as project_code
      FROM units u
      JOIN projects p ON u.project_id = p.id AND p.deleted_at IS NULL
      WHERE u.tenant_id = $1 AND u.deleted_at IS NULL
    `;
    const params = [tenantId];
    let idx = 2;

    if (projectId) { sql += ` AND u.project_id = $${idx++}`; params.push(projectId); }
    if (tower) { sql += ` AND u.tower = $${idx++}`; params.push(tower); }
    if (status) { sql += ` AND u.status = $${idx++}`; params.push(status); }

    sql += ' ORDER BY u.tower, u.floor, u.unit_number';
    const units = await query(sql, params);
    return successResponse(units);
  } catch (error) {
    return errorResponse(error.message);
  }
}
