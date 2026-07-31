import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';

const DEFAULT_JOB_PAGE_SIZE = 15;
const MAX_JOB_PAGE_SIZE = 50;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request) => {
    const sql = controlPlaneSql();
    const url = new URL(request.url);
    const jobsPage = positiveInteger(url.searchParams.get('jobsPage'), 1);
    const jobsPageSize = Math.min(
      positiveInteger(url.searchParams.get('jobsPageSize'), DEFAULT_JOB_PAGE_SIZE),
      MAX_JOB_PAGE_SIZE,
    );
    const jobsOffset = (jobsPage - 1) * jobsPageSize;

    const [summary] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'provisioning')::int AS provisioning,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE data_location_status = 'soft_deleted')::int AS soft_deleted,
        COUNT(*) FILTER (WHERE data_location_status = 'purged')::int AS purged
      FROM tenants
    `;

    const [commercialSummary] = await sql`
      SELECT
        COUNT(DISTINCT tenant.id)
          FILTER (WHERE tenant.deleted_at IS NULL AND subscription.status IN ('active','trial','paused'))::int
          AS subscribed,
        COUNT(DISTINCT tenant.id)
          FILTER (WHERE tenant.deleted_at IS NULL AND current_subscription.id IS NULL)::int
          AS without_plan,
        COUNT(*) FILTER (WHERE subscription.status = 'trial')::int AS trials
      FROM tenants tenant
      LEFT JOIN LATERAL (
        SELECT id
        FROM subscriptions current_item
        WHERE current_item.tenant_id = tenant.id
          AND current_item.status IN ('active','trial','paused')
        ORDER BY current_item.starts_at DESC
        LIMIT 1
      ) current_subscription ON true
      LEFT JOIN subscriptions subscription ON subscription.id = current_subscription.id
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
        latest_job.id AS provisioning_job_id,
        latest_job.status AS provisioning_job_status,
        latest_job.current_step AS provisioning_current_step,
        latest_job.attempt_count AS provisioning_attempt_count,
        latest_job.error_code AS provisioning_error_code,
        latest_job.error_message AS provisioning_error_message,
        latest_job.started_at AS provisioning_started_at,
        latest_job.finished_at AS provisioning_finished_at,
        latest_job.updated_at AS provisioning_updated_at,
        current_subscription.id AS subscription_id,
        current_subscription.status AS subscription_status,
        current_subscription.starts_at AS subscription_starts_at,
        current_subscription.ends_at AS subscription_ends_at,
        current_plan.id AS plan_id,
        current_plan.code AS plan_code,
        current_plan.name AS plan_name,
        current_plan.currency AS plan_currency,
        current_plan.monthly_price_cents AS plan_monthly_price_cents,
        current_plan.annual_price_cents AS plan_annual_price_cents,
        COALESCE(channel_summary.total, 0)::int AS channel_total,
        COALESCE(channel_summary.enabled, 0)::int AS channel_enabled,
        COALESCE(channel_summary.verified, 0)::int AS channel_verified,
        COALESCE(flag_summary.total, 0)::int AS feature_flag_count,
        latest_export.id AS export_job_id,
        latest_export.status AS export_status,
        latest_export.requested_at AS export_requested_at,
        latest_export.completed_at AS export_completed_at,
        latest_deletion.id AS deletion_job_id,
        latest_deletion.mode AS deletion_mode,
        latest_deletion.status AS deletion_status,
        latest_deletion.legal_hold AS deletion_legal_hold,
        latest_deletion.scheduled_for AS deletion_scheduled_for,
        CASE
          WHEN t.status = 'failed' THEN 'critical'
          WHEN latest_job.status IN ('queued','running')
               AND latest_job.updated_at < NOW() - INTERVAL '10 minutes' THEN 'critical'
          WHEN t.status = 'suspended' THEN 'paused'
          WHEN t.status = 'active'
               AND t.data_location_status = 'ready'
               AND t.migration_version IS NOT NULL THEN 'healthy'
          ELSE 'attention'
        END AS health_status
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT
          id, status, current_step, attempt_count, error_code, error_message,
          started_at, finished_at, updated_at
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
          CASE WHEN status IN ('active','trial','paused') THEN 0 ELSE 1 END,
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
      LEFT JOIN LATERAL (
        SELECT id, status, requested_at, completed_at
        FROM tenant_export_jobs
        WHERE tenant_id = t.id
        ORDER BY requested_at DESC
        LIMIT 1
      ) latest_export ON true
      LEFT JOIN LATERAL (
        SELECT id, mode, status, legal_hold, scheduled_for
        FROM tenant_deletion_jobs
        WHERE tenant_id = t.id
        ORDER BY requested_at DESC
        LIMIT 1
      ) latest_deletion ON true
      WHERE t.deleted_at IS NULL
      ORDER BY
        CASE WHEN t.status = 'failed' THEN 0 WHEN t.status = 'provisioning' THEN 1 ELSE 2 END,
        t.created_at DESC
    `);

    const platformUsers = await sql`
      SELECT id, email, name, role, status, created_at, updated_at
      FROM platform_users
      WHERE deleted_at IS NULL
      ORDER BY name, email
    `;

    const plans = await sql`
      SELECT
        p.id, p.code, p.name, p.description, p.status, p.entitlements,
        p.monthly_price_cents, p.annual_price_cents, p.currency,
        p.trial_days, p.display_order, p.created_at, p.updated_at,
        COUNT(DISTINCT s.tenant_id)
          FILTER (WHERE subscribed_tenant.id IS NOT NULL)::int AS subscription_count,
        COUNT(DISTINCT s.tenant_id)
          FILTER (
            WHERE s.status IN ('active','trial','paused')
              AND subscribed_tenant.id IS NOT NULL
          )::int AS active_subscription_count
      FROM plans p
      LEFT JOIN subscriptions s ON s.plan_id = p.id
      LEFT JOIN tenants subscribed_tenant
        ON subscribed_tenant.id = s.tenant_id
       AND subscribed_tenant.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.display_order, p.name
    `;

    const subscriptions = await sql`
      SELECT
        s.id, s.status, s.starts_at, s.ends_at, s.notes, s.cancelled_at,
        s.created_at, s.updated_at,
        t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
        p.id AS plan_id, p.code AS plan_code, p.name AS plan_name,
        p.currency, p.monthly_price_cents, p.annual_price_cents,
        assigned.email AS assigned_by_email
      FROM subscriptions s
      JOIN tenants t ON t.id = s.tenant_id
      JOIN plans p ON p.id = s.plan_id
      LEFT JOIN platform_users assigned ON assigned.id = s.assigned_by
      WHERE t.deleted_at IS NULL
      ORDER BY
        t.name,
        CASE WHEN s.status IN ('active','trial','paused') THEN 0 ELSE 1 END,
        s.starts_at DESC
    `;

    const [{ total: provisioningJobTotal }] = await sql`
      SELECT COUNT(*)::int AS total
      FROM provisioning_jobs pj
      JOIN tenants t ON t.id = pj.tenant_id
      WHERE t.deleted_at IS NULL
    `;

    const provisioningJobs = await sql`
      SELECT
        pj.id, pj.job_type, pj.status, pj.current_step, pj.attempt_count,
        pj.error_code, pj.error_message, pj.started_at, pj.finished_at,
        pj.created_at, pj.updated_at,
        t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
      FROM provisioning_jobs pj
      JOIN tenants t ON t.id = pj.tenant_id
      WHERE t.deleted_at IS NULL
      ORDER BY pj.created_at DESC
      LIMIT ${jobsPageSize}
      OFFSET ${jobsOffset}
    `;

    const channels = await sql`
      SELECT
        tc.id, tc.channel_type, tc.provider, tc.enabled,
        tc.verification_status, tc.last_verified_at, tc.updated_at,
        t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
      FROM tenant_channels tc
      JOIN tenants t ON t.id = tc.tenant_id
      WHERE t.deleted_at IS NULL
        AND tc.channel_type IN ('email', 'sms', 'whatsapp')
      ORDER BY t.name, tc.channel_type
    `;

    const featureFlags = await sql`
      SELECT
        ff.id, ff.flag_key, ff.forced_value, ff.reason,
        ff.created_at, ff.updated_at, ff.tenant_id,
        t.name AS tenant_name, t.slug AS tenant_slug
      FROM feature_flags ff
      LEFT JOIN tenants t ON t.id = ff.tenant_id
      WHERE t.id IS NULL OR t.deleted_at IS NULL
      ORDER BY ff.flag_key, t.name NULLS FIRST
    `;

    const exportJobs = await sql`
      SELECT export.id, export.tenant_id, export.status, export.format,
             export.table_count, export.row_count, export.byte_count,
             export.requested_at, export.started_at, export.completed_at,
             export.expires_at, export.error_message, export.manifest,
             tenant.name AS tenant_name, tenant.slug AS tenant_slug,
             actor.email AS requested_by_email
      FROM tenant_export_jobs export
      JOIN tenants tenant ON tenant.id = export.tenant_id
      LEFT JOIN platform_users actor ON actor.id = export.requested_by
      ORDER BY export.requested_at DESC
      LIMIT 50
    `;

    const deletionJobs = await sql`
      SELECT deletion.id, deletion.tenant_id, deletion.mode, deletion.status,
             deletion.legal_hold, deletion.requested_at, deletion.scheduled_for,
             deletion.started_at, deletion.completed_at, deletion.cancelled_at,
             deletion.reason, deletion.error_message, deletion.evidence,
             tenant.name AS tenant_name, tenant.slug AS tenant_slug,
             actor.email AS requested_by_email
      FROM tenant_deletion_jobs deletion
      JOIN tenants tenant ON tenant.id = deletion.tenant_id
      LEFT JOIN platform_users actor ON actor.id = deletion.requested_by
      ORDER BY deletion.requested_at DESC
      LIMIT 50
    `;

    const recentAudit = await sql`
      SELECT audit.id, audit.actor_email, audit.action, audit.entity_type,
             audit.entity_id, audit.tenant_id, audit.metadata, audit.created_at,
             tenant.name AS tenant_name, tenant.slug AS tenant_slug
      FROM platform_audit_logs audit
      LEFT JOIN tenants tenant ON tenant.id = audit.tenant_id
      ORDER BY audit.created_at DESC
      LIMIT 25
    `;

    return successResponse({
      summary: { ...summary, ...commercialSummary },
      tenants,
      platformUsers,
      plans,
      subscriptions,
      provisioningJobs,
      provisioningJobsPage: {
        page: jobsPage,
        pageSize: jobsPageSize,
        total: provisioningJobTotal,
        totalPages: Math.max(1, Math.ceil(provisioningJobTotal / jobsPageSize)),
      },
      channels,
      featureFlags,
      exportJobs,
      deletionJobs,
      recentAudit,
    });
  },
);