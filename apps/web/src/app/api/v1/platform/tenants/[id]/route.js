import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';
import { AppError, ErrorCode } from '@hippo/shared';

export const GET = withApiHandler(
  { platform: true, platformAuth: true },
  async (_request, context) => {
    const { id } = await context.params;
    const sql = controlPlaneSql();
    const tenants = await sql`
      SELECT id, name, slug, schema_name, status, isolation_mode,
             database_region, migration_version, data_location_status,
             branding, feature_flags, created_at, updated_at
      FROM tenants
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!tenants[0]) {
      throw new AppError(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found', 404);
    }

    const jobs = await sql`
      SELECT id, job_type, status, current_step, attempt_count, bullmq_job_id,
             error_code, error_message, started_at, finished_at, created_at, updated_at
      FROM provisioning_jobs
      WHERE tenant_id = ${id}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    const channels = await sql`
      SELECT channel_type, provider, enabled, verification_status,
             encryption_key_version, last_verified_at, updated_at
      FROM tenant_channels
      WHERE tenant_id = ${id}
      ORDER BY channel_type
    `;

    return successResponse({
      ...tenants[0],
      provisioningJobs: jobs,
      channels,
    });
  },
);
