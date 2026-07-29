import { successResponse, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';
import { filterProjectsByScope } from '@/modules/projects/property-service.js';

/** List units across accessible projects (legacy list endpoint). */
export const GET = withApiHandler(
  { auth: true, permission: Permission.UNIT_READ },
  async () => {
    const ctx = requireAuthContext();
    const sql = tenantSql();
    const projects = await sql.unsafe(
      `SELECT id, created_by FROM projects WHERE deleted_at IS NULL`,
    );
    const allowed = filterProjectsByScope(ctx, projects).map((p) => p.id);
    if (!allowed.length) return successResponse([]);
    const rows = await sql.unsafe(
      `SELECT u.*, t.code as tower_code, f.floor_number
       FROM units u
       JOIN towers t ON t.id = u.tower_id
       JOIN floors f ON f.id = u.floor_id
       WHERE u.deleted_at IS NULL AND u.project_id = ANY($1::uuid[])
       ORDER BY u.created_at DESC
       LIMIT 500`,
      [allowed],
    );
    return successResponse(rows);
  },
);
