import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.ISSUE_MANAGE },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    return successResponse(
      await sql.unsafe(
        `SELECT * FROM issues WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [id],
      ),
    );
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.ISSUE_MANAGE,
    audit: { action: 'create', entityType: 'issue' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    if (!body.title) throw AppError.validation('title required');
    const sql = tenantSql();
    const [row] = await sql.unsafe(
      `INSERT INTO issues (tenant_id, project_id, title, description, severity, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        ctx.tenantId,
        id,
        body.title,
        body.description || null,
        body.severity || 'medium',
        ctx.userId,
      ],
    );
    return successResponse(row, {}, 201);
  },
);
