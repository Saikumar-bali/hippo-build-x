import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.PROJECT_READ },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    const rows = await sql.unsafe(
      `SELECT * FROM blocks WHERE project_id = $1 AND deleted_at IS NULL ORDER BY code`,
      [id],
    );
    return successResponse(rows);
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.PROJECT_UPDATE,
    audit: { action: 'create', entityType: 'block' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    if (!body.name || !body.code) throw AppError.validation('name and code required');
    const sql = tenantSql();
    const [row] = await sql.unsafe(
      `INSERT INTO blocks (tenant_id, project_id, name, code, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ctx.tenantId, id, body.name, body.code, ctx.userId],
    );
    return successResponse(row, {}, 201);
  },
);
