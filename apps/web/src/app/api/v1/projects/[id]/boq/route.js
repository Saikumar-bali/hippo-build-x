import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.BOQ_MANAGE },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    return successResponse(
      await sql.unsafe(
        `SELECT * FROM boq_items WHERE project_id = $1 AND deleted_at IS NULL ORDER BY code, created_at`,
        [id],
      ),
    );
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.BOQ_MANAGE,
    audit: { action: 'create', entityType: 'boq_item' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    if (!body.description) throw AppError.validation('description required');
    const qty = Number(body.quantity || 0);
    const rate = Number(body.rate || 0);
    const sql = tenantSql();
    const [row] = await sql.unsafe(
      `INSERT INTO boq_items (tenant_id, project_id, code, description, unit, quantity, rate, amount, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        ctx.tenantId,
        id,
        body.code || null,
        body.description,
        body.unit || null,
        qty,
        rate,
        qty * rate,
        ctx.userId,
      ],
    );
    return successResponse(row, {}, 201);
  },
);
