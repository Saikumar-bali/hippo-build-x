import { query } from '@/lib/db';

export async function GET() {
  try {
    const projects = await query('SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC');
    return Response.json({ success: true, data: projects });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
