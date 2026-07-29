import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';
import {
  assertProjectAccess,
  generateUnits,
} from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.UNIT_READ },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const { searchParams } = new URL(request.url);
    const towerId = searchParams.get('towerId');
    const status = searchParams.get('status');
    const sql = tenantSql();
    let text = `SELECT u.*, t.code as tower_code, f.floor_number, c.name as category_name
      FROM units u
      JOIN towers t ON t.id = u.tower_id
      JOIN floors f ON f.id = u.floor_id
      LEFT JOIN unit_categories c ON c.id = u.category_id
      WHERE u.project_id = $1 AND u.deleted_at IS NULL`;
    const params = [id];
    let idx = 2;
    if (towerId) {
      text += ` AND u.tower_id = $${idx++}`;
      params.push(towerId);
    }
    if (status) {
      text += ` AND u.status = $${idx++}`;
      params.push(status);
    }
    text += ` ORDER BY t.code, f.floor_number, u.unit_number`;
    const rows = await sql.unsafe(text, params);
    return successResponse(rows);
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.UNIT_CREATE,
    audit: { action: 'create', entityType: 'unit_batch' },
  },
  async (request, context) => {
    // Alias for generate-units when posting to /units with generate payload
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    const sql = tenantSql();
    const created = await generateUnits(sql, {
      tenantId: ctx.tenantId,
      projectId: id,
      towerId: body.towerId,
      categoryId: body.categoryId,
      floorFrom: Number(body.floorFrom),
      floorTo: Number(body.floorTo),
      unitsPerFloor: Number(body.unitsPerFloor || 1),
      unitPrefix: body.unitPrefix || '',
      userId: ctx.userId,
    });
    return successResponse({ count: created.length, units: created }, {}, 201);
  },
);
