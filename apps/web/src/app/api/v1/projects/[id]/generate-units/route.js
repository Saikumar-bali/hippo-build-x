import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';
import {
  assertProjectAccess,
  generateUnits,
} from '@/modules/projects/property-service.js';
import { AppError } from '@hippo/shared';

export const dynamic = 'force-dynamic';

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.UNIT_CREATE,
    audit: { action: 'generate', entityType: 'unit_batch' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    const floorFromMissing = body.floorFrom === null || body.floorFrom === undefined;
    const floorToMissing = body.floorTo === null || body.floorTo === undefined;
    if (!body.towerId || floorFromMissing || floorToMissing) {
      throw AppError.validation('towerId, floorFrom, and floorTo are required');
    }
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
