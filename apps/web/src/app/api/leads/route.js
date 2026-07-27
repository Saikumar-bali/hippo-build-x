import { query } from '@/lib/db';

export async function GET() {
  try {
    const leads = await query(`
      SELECT l.*, u.name as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
      WHERE l.deleted_at IS NULL
      ORDER BY l.created_at DESC
    `);
    return Response.json({ success: true, data: leads });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, phone, source, notes } = body;

    if (!name) {
      return Response.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const tenantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const actorId = 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    const result = await query(
      `INSERT INTO leads (tenant_id, name, email, phone, source, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [tenantId, name, email || null, phone || null, source || 'direct', notes || null, actorId, actorId],
    );

    return Response.json({ success: true, data: result[0] }, { status: 201 });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
