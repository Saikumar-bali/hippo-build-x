import {
  successResponse,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { TENANT_STATUS } from '@hippo/db';
import { enqueueTenantProvision } from '@/lib/queues';
import { AppError, ErrorCode } from '@hippo/shared';

async function enqueueRegisteredJob(tenant, job) {
  if (job.status !== 'queued' || job.current_step !== 'registered') {
    return { mode: 'existing' };
  }

  const payload = job.payload || {};
  return enqueueTenantProvision({
    tenantId: tenant.id,
    schemaName: tenant.schema_name,
    slug: tenant.slug,
    adminEmail: payload.adminEmail,
    adminName: payload.adminName,
    provisioningJobId: job.id,
  });
}

async function loadRetryState(sql, tenantId, jobId) {
  const [fresh] = await sql`
    SELECT t.id, t.slug, t.schema_name, t.status, t.isolation_mode,
           pj.id AS provisioning_job_id, pj.status AS provisioning_job_status,
           pj.current_step AS provisioning_current_step
    FROM tenants t
    JOIN provisioning_jobs pj ON pj.id = ${jobId}
    WHERE t.id = ${tenantId}
  `;
  return fresh;
}

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

    const [existingJob] = await sql`
      SELECT id, tenant_id, status, current_step, payload
      FROM provisioning_jobs
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;

    if (existingJob) {
      if (existingJob.tenant_id !== tenant.id) {
        throw new AppError(
          ErrorCode.ALREADY_EXISTS,
          'Idempotency key is already associated with another tenant',
          409,
        );
      }
      const queued = await enqueueRegisteredJob(tenant, existingJob);
      const fresh = await loadRetryState(sql, tenant.id, existingJob.id);
      return successResponse(
        {
          ...fresh,
          provisionMode: queued.mode,
          message: 'Existing provisioning retry replayed',
        },
        { idempotentReplay: true },
      );
    }

    const result = await sql.begin(async (tx) => {
      const [job] = await tx`
        INSERT INTO provisioning_jobs
          (tenant_id, idempotency_key, status, current_step, requested_by, payload)
        VALUES
          (${tenant.id}, ${idempotencyKey}, 'queued', 'registered', ${platformUser.id},
           ${JSON.stringify(payload)}::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, tenant_id, status, current_step, payload
      `;

      if (!job) {
        const [conflictingJob] = await tx`
          SELECT id, tenant_id, status, current_step, payload
          FROM provisioning_jobs
          WHERE idempotency_key = ${idempotencyKey}
          LIMIT 1
        `;
        return { job: conflictingJob, created: false };
      }

      await tx`
        UPDATE tenants
        SET status = ${TENANT_STATUS.PROVISIONING},
            data_location_status = 'retrying',
            updated_at = NOW()
        WHERE id = ${tenant.id}
      `;
      return { job, created: true };
    });

    if (!result.job) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        'Unable to create or replay provisioning retry',
        500,
      );
    }
    if (result.job.tenant_id !== tenant.id) {
      throw new AppError(
        ErrorCode.ALREADY_EXISTS,
        'Idempotency key is already associated with another tenant',
        409,
      );
    }

    const queued = await enqueueRegisteredJob(tenant, result.job);
    const fresh = await loadRetryState(sql, tenant.id, result.job.id);

    return successResponse(
      {
        ...fresh,
        provisionMode: queued.mode,
        message: result.created
          ? queued.mode === 'sync'
            ? 'Provisioned synchronously'
            : 'Provisioning queued'
          : 'Existing provisioning retry replayed',
      },
      result.created ? {} : { idempotentReplay: true },
    );
  },
);
