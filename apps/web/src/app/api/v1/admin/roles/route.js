import { query } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-utils';

export async function GET() {
  try {
    const roles = await query('SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY name');
    return successResponse(roles);
  } catch (error) {
    return errorResponse(error.message);
  }
}
