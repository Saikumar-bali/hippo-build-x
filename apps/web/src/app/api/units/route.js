import { query } from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const tower = searchParams.get('tower');
    const status = searchParams.get('status');

    let sql = `
      SELECT u.*, p.name as project_name, p.code as project_code
      FROM units u
      JOIN projects p ON u.project_id = p.id AND p.deleted_at IS NULL
      WHERE u.deleted_at IS NULL
    `;
    const params = [];
    let idx = 1;

    if (projectId) {
      sql += ` AND u.project_id = $${idx++}`;
      params.push(projectId);
    }
    if (tower) {
      sql += ` AND u.tower = $${idx++}`;
      params.push(tower);
    }
    if (status) {
      sql += ` AND u.status = $${idx++}`;
      params.push(status);
    }

    sql += ' ORDER BY u.tower, u.floor, u.unit_number';

    const units = await query(sql, params);
    return Response.json({ success: true, data: units });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
