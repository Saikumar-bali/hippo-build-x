import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';

/**
 * Platform-level CEO dashboard (control plane counts only in Phase 0).
 */
export const GET = withApiHandler({ platform: true, platformAuth: true }, async () => {
  const sql = controlPlaneSql();
  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM tenants WHERE deleted_at IS NULL) as total_tenants,
      (SELECT COUNT(*)::int FROM tenants WHERE status = 'active' AND deleted_at IS NULL) as active_tenants,
      (SELECT COUNT(*)::int FROM tenants WHERE status = 'provisioning' AND deleted_at IS NULL) as provisioning_tenants
  `;
  return successResponse({
    ...stats,
    total_users: 0,
    total_projects: 0,
    total_units: 0,
    available_units: 0,
    booked_units: 0,
    total_leads: 0,
    new_leads: 0,
  });
});
