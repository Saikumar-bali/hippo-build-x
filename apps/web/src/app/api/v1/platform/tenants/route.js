import { query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-utils';

export async function GET() {
  try {
    const tenants = await query('SELECT * FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC');
    return successResponse(tenants);
  } catch (error) {
    return errorResponse(error.message);
  }
}

export async function POST(request) {
  try {
    const { name, slug } = await request.json();
    if (!name || !slug) return errorResponse('Name and slug are required', 400, 'VALIDATION_ERROR');

    const [tenant] = await query(
      'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING *',
      [name, slug],
    );
    return successResponse(tenant, {}, 201);
  } catch (error) {
    return errorResponse(error.message);
  }
}
