import { queryOne } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-utils';

export async function GET() {
  try {
    const stats = await queryOne(`
      SELECT
        (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL) as total_tenants,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as total_users,
        (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL) as total_projects,
        (SELECT COUNT(*) FROM units WHERE deleted_at IS NULL) as total_units,
        (SELECT COUNT(*) FROM units WHERE status = 'available' AND deleted_at IS NULL) as available_units,
        (SELECT COUNT(*) FROM units WHERE status = 'booked' AND deleted_at IS NULL) as booked_units,
        (SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL) as total_leads,
        (SELECT COUNT(*) FROM leads WHERE status = 'new' AND deleted_at IS NULL) as new_leads
    `);
    return successResponse(stats);
  } catch (error) {
    return errorResponse(error.message);
  }
}
