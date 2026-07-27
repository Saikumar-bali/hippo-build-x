import { query } from '@/lib/db';

export async function GET() {
  try {
    const tenants = await query('SELECT * FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC');
    return Response.json({ success: true, data: tenants });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
