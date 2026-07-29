import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';
import { AppError, ErrorCode } from '@hippo/shared';

export const GET = withApiHandler({ platform: true, platformAuth: true }, async (_request, context) => {
  const { id } = await context.params;
  const sql = controlPlaneSql();
  const rows = await sql`
    SELECT id, name, slug, schema_name, status, branding, feature_flags, created_at, updated_at
    FROM tenants
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw new AppError(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found', 404);
  }
  return successResponse(rows[0]);
});
