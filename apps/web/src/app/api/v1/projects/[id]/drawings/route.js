import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import {
  assertProjectAccess,
  createDrawingVersion,
} from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.DRAWING_MANAGE },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    return successResponse(
      await sql.unsafe(
        `SELECT * FROM drawings WHERE project_id = $1 AND deleted_at IS NULL
         ORDER BY drawing_number, version DESC`,
        [id],
      ),
    );
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.DRAWING_MANAGE,
    audit: { action: 'create', entityType: 'drawing' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    if (!body.title || !body.drawingNumber) {
      throw AppError.validation('title and drawingNumber required');
    }
    const sql = tenantSql();
    const row = await createDrawingVersion(sql, {
      tenantId: ctx.tenantId,
      projectId: id,
      drawingNumber: body.drawingNumber,
      title: body.title,
      fileUrl: body.fileUrl,
      notes: body.notes,
      userId: ctx.userId,
    });
    return successResponse(row, {}, 201);
  },
);
