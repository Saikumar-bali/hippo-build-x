import { successResponse, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

/** Aggregate structure for Structure tab */
export const GET = withApiHandler(
  { auth: true, permission: Permission.PROJECT_READ },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    const [blocks, towers, floors, categories] = await Promise.all([
      sql.unsafe(`SELECT * FROM blocks WHERE project_id = $1 AND deleted_at IS NULL ORDER BY code`, [
        id,
      ]),
      sql.unsafe(`SELECT * FROM towers WHERE project_id = $1 AND deleted_at IS NULL ORDER BY code`, [
        id,
      ]),
      sql.unsafe(
        `SELECT * FROM floors WHERE project_id = $1 AND deleted_at IS NULL ORDER BY floor_number`,
        [id],
      ),
      sql.unsafe(
        `SELECT * FROM unit_categories WHERE project_id = $1 AND deleted_at IS NULL ORDER BY code`,
        [id],
      ),
    ]);
    return successResponse({ blocks, towers, floors, categories });
  },
);
