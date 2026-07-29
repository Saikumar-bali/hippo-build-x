import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';
import { TENANT_STATUS } from '@hippo/db';
import { enqueueTenantProvision } from '@/lib/queues';
import { AppError, ErrorCode } from '@hippo/shared';

export const POST = withApiHandler({ platform: true, platformAuth: true }, async (_request, context) => {
  const { id } = await context.params;
  const sql = controlPlaneSql();

  const rows = await sql`
    SELECT id, name, slug, schema_name, status
    FROM tenants
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw new AppError(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found', 404);
  }

  const tenant = rows[0];
  if (tenant.status === TENANT_STATUS.ACTIVE) {
    return successResponse({
      ...tenant,
      message: 'Tenant already active; provisioning skipped',
    });
  }

  await sql`
    UPDATE tenants
    SET status = ${TENANT_STATUS.PROVISIONING}, updated_at = NOW()
    WHERE id = ${tenant.id}
  `;

  const job = await enqueueTenantProvision({
    tenantId: tenant.id,
    schemaName: tenant.schema_name,
    slug: tenant.slug,
  });

  const [fresh] = await sql`
    SELECT id, slug, schema_name, status FROM tenants WHERE id = ${tenant.id}
  `;

  return successResponse({
    ...fresh,
    provisionMode: job.mode,
    message: job.mode === 'sync' ? 'Provisioned synchronously' : 'Provisioning re-queued',
  });
});
