import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async () => {
    const sql = controlPlaneSql();

    const [summary] = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'provisioning')::int AS provisioning,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended
      FROM tenants
      WHERE deleted_at IS NULL
    `;

    const tenants = await sql.unsafe(`
      SELECT
        t.id,
        t.name,
        t.slug,
        t.status,
        t.isolation_mode,
        t.storage_prefix,
        t.migration_version,
        t.data_location_status,
        t.created_at,
        t.updated_at,
        latest_job.status AS provisioning_job_status,
        latest_job.current_step AS provisioning_current_step,
        latest_job.attempt_count AS provisioning_attempt_count,
        latest_job.error_code AS provisioning_error_code,
        latest_job.error_message AS provisioning_error_message,
        current_subscription.id AS subscription_id,
        current_subscription.status AS subscription_status,
        current_subscription.starts_at AS subscription_starts_at,
        current_subscription.ends_at AS subscription_ends_at,
        current_plan.id AS plan_id,
        current_plan.code AS plan_code,
        current_plan.name AS plan_name,
        COALESCE(channel_summary.total, 0)::int AS channel_total,
        COALESCE(channel_summary.enabled, 0)::int AS channel_enabled,
        COALESCE(channel_summary.verified, 0)::int AS channel_verified,
        COALESCE(flag_summary.total, 0)::int AS feature_flag_count
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT status, current_step, attempt_count, error_code, error_message
        FROM provisioning_jobs
        WHERE tenant_id = t.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest_job ON true
      LEFT JOIN LATERAL (
        SELECT id, plan_id, status, starts_at, ends_at
        FROM subscriptions
        WHERE tenant_id = t.id
        ORDER BY
          CASE WHEN status = 'active' THEN 0 ELSE 1 END,
          starts_at DESC
        LIMIT 1
      ) current_subscription ON true
      LEFT JOIN plans current_plan ON current_plan.id = current_subscription.plan_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE enabled)::int AS enabled,
          COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verified
        FROM tenant_channels
        WHERE tenant_id = t.id
          AND channel_type IN ('email', 'sms', 'whatsapp')
      ) channel_summary ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS total
        FROM feature_flags
        WHERE tenant_id = t.id
      ) flag_summary ON true
      WHERE t.deleted_at IS NULL
      ORDER BY t.created_at DESC
    `);

    const plans = await sql`
      SELECT
        p.id,
        p.code,
        p.name,
        p.status,
        p.entitlements,
        p.created_at,
        p.updated_at,
        COUNT(s.id)::int AS subscription_count,
        COUNT(s.id) FILTER (WHERE s.status = 'active')::int AS active_subscription_count
      FROM plans p
      LEFT JOIN subscriptions s ON s.plan_id = p.id
      GROUP BY p.id
      ORDER BY p.name
    `;

    const subscriptions = await sql`
      SELECT
        s.id,
        s.status,
        s.starts_at,
        s.ends_at,
        s.created_at,
        s.updated_at,
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        p.id AS plan_id,
        p.code AS plan_code,
        p.name AS plan_name
      FROM subscriptions s
      JOIN tenants t ON t.id = s.tenant_id
      JOIN plans p ON p.id = s.plan_id
      WHERE t.deleted_at IS NULL
      ORDER BY s.created_at DESC
    `;

    const provisioningJobs = await sql`
      SELECT
        pj.id,
        pj.job_type,
        pj.status,
        pj.current_step,
        pj.attempt_count,
        pj.error_code,
        pj.error_message,
        pj.started_at,
        pj.finished_at,
        pj.created_at,
        pj.updated_at,
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug
      FROM provisioning_jobs pj
      JOIN tenants t ON t.id = pj.tenant_id
      WHERE t.deleted_at IS NULL
      ORDER BY pj.created_at DESC
      LIMIT 100
    `;

    const channels = await sql`
      SELECT
        tc.id,
        tc.channel_type,
        tc.provider,
        tc.enabled,
        tc.verification_status,
        tc.last_verified_at,
        tc.updated_at,
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug
      FROM tenant_channels tc
      JOIN tenants t ON t.id = tc.tenant_id
      WHERE t.deleted_at IS NULL
        AND tc.channel_type IN ('email', 'sms', 'whatsapp')
      ORDER BY t.name, tc.channel_type
    `;

    const featureFlags = await sql`
      SELECT
        ff.id,
        ff.flag_key,
        ff.forced_value,
        ff.reason,
        ff.created_at,
        ff.updated_at,
        ff.tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug
      FROM feature_flags ff
      LEFT JOIN tenants t ON t.id = ff.tenant_id
      WHERE t.id IS NULL OR t.deleted_at IS NULL
      ORDER BY ff.flag_key, t.name NULLS FIRST
    `;

    return successResponse({
      summary,
      tenants,
      plans,
      subscriptions,
      provisioningJobs,
      channels,
      featureFlags,
      phaseOwnership: {
        availableNow: ['tenants', 'platform_users', 'provisioning_jobs', 'tenant_channels'],
        phase12Management: ['plans', 'subscriptions', 'feature_flags', 'suspend_resume'],
      },
    });
  },
);
