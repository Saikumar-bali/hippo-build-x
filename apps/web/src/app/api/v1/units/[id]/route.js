import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext, getRequestId } from '@/lib/tenant-context.js';
import { AppError, ErrorCode } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import {
  assertProjectAccess,
  changeUnitStatus,
} from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.UNIT_READ },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    const sql = tenantSql();
    const rows = await sql.unsafe(
      `SELECT u.*, t.code as tower_code, f.floor_number
       FROM units u
       JOIN towers t ON t.id = u.tower_id
       JOIN floors f ON f.id = u.floor_id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id],
    );
    if (!rows[0]) throw new AppError(ErrorCode.NOT_FOUND, 'Unit not found', 404);
    assertProjectAccess(ctx, rows[0].project_id);
    const history = await sql.unsafe(
      `SELECT * FROM unit_status_history WHERE unit_id = $1 ORDER BY created_at DESC`,
      [id],
    );
    return successResponse({ ...rows[0], history });
  },
);

export const PATCH = withApiHandler(
  {
    auth: true,
    permission: Permission.UNIT_UPDATE,
    audit: { action: 'status_change', entityType: 'unit' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    const body = await parseBody(request);
    const sql = tenantSql();
    const existing = await sql.unsafe(
      `SELECT project_id FROM units WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!existing[0]) throw new AppError(ErrorCode.NOT_FOUND, 'Unit not found', 404);
    assertProjectAccess(ctx, existing[0].project_id);

    if (body.status) {
      const updated = await changeUnitStatus(sql, {
        tenantId: ctx.tenantId,
        unitId: id,
        toStatus: body.status,
        reason: body.reason,
        actorId: ctx.userId,
        correlationId: getRequestId(),
      });
      return successResponse(updated);
    }

    throw AppError.validation('status is required');
  },
);
