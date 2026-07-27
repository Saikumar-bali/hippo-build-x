import { query } from '@/lib/db';

export async function GET() {
  try {
    const users = await query(`
      SELECT u.id, u.name, u.email, u.status, u.created_at,
             r.name as role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.deleted_at IS NULL
      LEFT JOIN roles r ON ur.role_id = r.id AND r.deleted_at IS NULL
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `);
    return Response.json({ success: true, data: users });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
