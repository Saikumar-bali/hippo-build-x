import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.PROJECT_READ },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const towerId = new URL(request.url).searchParams.get('towerId');
    const sql = tenantSql();
    let text = `SELECT * FROM floors WHERE project_id = $1 AND deleted_at IS NULL`;
    const params = [id];
    if (towerId) {
      text += ` AND tower_id = $2`;
      params.push(towerId);
    }
    text += ` ORDER BY tower_id, floor_number`;
    return successResponse(await sql.unsafe(text, params));
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.PROJECT_UPDATE,
    audit: { action: 'create', entityType: 'floor' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    const floorNumberMissing = body.floorNumber === null || body.floorNumber === undefined;
    if (!body.towerId || floorNumberMissing) {
      throw AppError.validation('towerId and floorNumber required');
    }
    const sql = tenantSql();
    const [row] = await sql.unsafe(
      `INSERT INTO floors (tenant_id, project_id, tower_id, floor_number, name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        ctx.tenantId,
        id,
        body.towerId,
        Number(body.floorNumber),
        body.name || `Floor ${body.floorNumber}`,
        ctx.userId,
      ],
    );
    return successResponse(row, {}, 201);
  },
);
