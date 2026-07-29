import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.RFI_MANAGE },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    return successResponse(
      await sql.unsafe(
        `SELECT * FROM rfis WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [id],
      ),
    );
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.RFI_MANAGE,
    audit: { action: 'create', entityType: 'rfi' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    if (!body.title || !body.question) throw AppError.validation('title and question required');
    const sql = tenantSql();
    const [row] = await sql.unsafe(
      `INSERT INTO rfis (tenant_id, project_id, title, question, raised_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$5) RETURNING *`,
      [ctx.tenantId, id, body.title, body.question, ctx.userId],
    );
    return successResponse(row, {}, 201);
  },
);
