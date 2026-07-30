import {
  successResponse,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { TENANT_STATUS } from '@hippo/db';
import { enqueueTenantProvision } from '@/lib/queues';
import { AppError, ErrorCode } from '@hippo/shared';

export const POST = withApiHandler(
  { platform: true, platformAuth: true },
  async (request, context) => {
    const { id } = await context.params;
    const platformUser = requirePlatformUser();
    const sql = controlPlaneSql();

    const rows = await sql`
      SELECT id, name, slug, schema_name, status
      FROM tenants
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!rows[0]) {
      throw new AppError(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found', 404);
    }
    const tenant = rows[0];
    if (tenant.status === TENANT_STATUS.ACTIVE) {
      return successResponse({ ...tenant, message: 'Tenant is already active' });
    }

    const previousJobs = await sql`
      SELECT payload FROM provisioning_jobs
      WHERE tenant_id = ${tenant.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    const payload = previousJobs[0]?.payload || {};
    const idempotencyKey =
      request.headers.get('idempotency-key') ||
      `tenant-retry:${tenant.id}:${crypto.randomUUID()}`;

    const [job] = await sql.begin(async (tx) => {
      await tx`
        UPDATE tenants
        SET status = ${TENANT_STATUS.PROVISIONING},
            data_location_status = 'retrying',
            updated_at = NOW()
        WHERE id = ${tenant.id}
      `;
      return tx`
        INSERT INTO provisioning_jobs
          (tenant_id, idempotency_key, status, current_step, requested_by, payload)
        VALUES
          (${tenant.id}, ${idempotencyKey}, 'queued', 'registered', ${platformUser.id},
           ${JSON.stringify(payload)}::jsonb)
        RETURNING id
      `;
    });

    const queued = await enqueueTenantProvision({
      tenantId: tenant.id,
      schemaName: tenant.schema_name,
      slug: tenant.slug,
      adminEmail: payload.adminEmail,
      adminName: payload.adminName,
      provisioningJobId: job.id,
    });

    const [fresh] = await sql`
      SELECT t.id, t.slug, t.schema_name, t.status, t.isolation_mode,
             pj.id AS provisioning_job_id, pj.status AS provisioning_job_status,
             pj.current_step AS provisioning_current_step
      FROM tenants t
      JOIN provisioning_jobs pj ON pj.id = ${job.id}
      WHERE t.id = ${tenant.id}
    `;

    return successResponse({
      ...fresh,
      provisionMode: queued.mode,
      message: queued.mode === 'sync' ? 'Provisioned synchronously' : 'Provisioning queued',
    });
  },
);
