import { successResponse, withApiHandler, tenantSql } from '@/lib/api-utils';

/** Minimal list for assignment dropdowns */
export const GET = withApiHandler({ auth: true }, async () => {
  const sql = tenantSql();
  const projects = await sql.unsafe(
    `SELECT id, name, code, status FROM projects WHERE deleted_at IS NULL ORDER BY name`,
  );
  const locations = await sql.unsafe(
    `SELECT id, name, code, project_id, status FROM locations WHERE deleted_at IS NULL ORDER BY name`,
  );
  return successResponse({ projects, locations });
});
