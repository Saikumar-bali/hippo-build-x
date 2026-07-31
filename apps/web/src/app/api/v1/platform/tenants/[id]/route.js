import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';
import { AppError, ErrorCode } from '@hippo/shared';

export const GET = withApiHandler(
  { platform: true, platformAuth: true },
  async (_request, context) => {
    const { id } = await context.params;
    const sql = controlPlaneSql();
    const tenants = await sql`
      SELECT id, name, slug, schema_name, status, isolation_mode,
             database_region, storage_prefix, migration_version, data_location_status,
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
        AND channel_type IN ('email', 'sms', 'whatsapp')
      ORDER BY channel_type
    `;
    const subscriptions = await sql`
      SELECT
        s.id,
        s.status,
        s.starts_at,
        s.ends_at,
        s.created_at,
        s.updated_at,
        p.id AS plan_id,
        p.code AS plan_code,
        p.name AS plan_name,
        p.entitlements AS plan_entitlements
      FROM subscriptions s
      JOIN plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ${id}
      ORDER BY
        CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
        s.starts_at DESC
      LIMIT 20
    `;
    const flags = await sql`
      SELECT id, flag_key, forced_value, reason, created_at, updated_at
      FROM feature_flags
      WHERE tenant_id = ${id}
      ORDER BY flag_key
    `;

    return successResponse({
      ...tenants[0],
      provisioningJobs: jobs,
      channels,
      subscriptions,
      featureFlags: flags,
    });
  },
);
