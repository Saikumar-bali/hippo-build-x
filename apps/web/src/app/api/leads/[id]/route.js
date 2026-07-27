import { query, queryOne } from '@/lib/db';

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const lead = await queryOne(
      `SELECT l.*, u.name as assigned_to_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id AND u.deleted_at IS NULL
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id],
    );

    if (!lead) {
      return Response.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    return Response.json({ success: true, data: lead });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await queryOne('SELECT * FROM leads WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!existing) {
      return Response.json({ success: false, error: 'Lead not found' }, { status: 404 });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of ['name', 'email', 'phone', 'status', 'pipeline_stage', 'notes', 'assigned_to']) {
      if (body[key] !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(body[key]);
        idx++;
      }
    }

    if (fields.length === 0) {
      return Response.json({ success: false, error: 'No fields to update' }, { status: 400 });
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    const updated = await queryOne(
      `UPDATE leads SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
