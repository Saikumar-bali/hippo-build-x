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
    return successResponse(
      await sql.unsafe(
        `SELECT * FROM unit_categories WHERE project_id = $1 AND deleted_at IS NULL ORDER BY code`,
        [id],
      ),
    );
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.PROJECT_UPDATE,
    audit: { action: 'create', entityType: 'unit_category' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    if (!body.name || !body.code) throw AppError.validation('name and code required');
    const sql = tenantSql();
    const [row] = await sql.unsafe(
      `INSERT INTO unit_categories (tenant_id, project_id, name, code, bedrooms, bathrooms, carpet_area, base_price, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        ctx.tenantId,
        id,
        body.name,
        body.code,
        body.bedrooms ?? null,
        body.bathrooms ?? null,
        body.carpetArea ?? null,
        body.basePrice ?? null,
        ctx.userId,
      ],
    );
    return successResponse(row, {}, 201);
  },
);
