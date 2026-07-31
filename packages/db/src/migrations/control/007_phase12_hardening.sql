-- Phase 12 hardening: fail-closed entitlements, scheduled subscriptions,
-- recoverable destructive work, per-instance heartbeats and append-only evidence.

ALTER TABLE control_plane.tenant_deletion_jobs
  ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destruction_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS storage_purged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schema_dropped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciliation_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

-- Collapse accidental historical duplicates before enforcing the active-job rule.
WITH ranked_purges AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY requested_at DESC, id DESC
    ) AS position
  FROM control_plane.tenant_deletion_jobs
  WHERE mode = 'purge'
    AND status IN ('scheduled', 'running', 'destruction_pending', 'reconciliation_required')
)
UPDATE control_plane.tenant_deletion_jobs deletion
SET status = 'cancelled',
    cancelled_at = COALESCE(deletion.cancelled_at, NOW()),
    error_message = COALESCE(deletion.error_message, 'Superseded while enforcing one active purge per tenant')
FROM ranked_purges ranked
WHERE deletion.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_deletion_jobs_one_active_purge_idx
  ON control_plane.tenant_deletion_jobs (tenant_id)
  WHERE mode = 'purge'
    AND status IN ('scheduled', 'running', 'destruction_pending', 'reconciliation_required');

CREATE INDEX IF NOT EXISTS tenant_deletion_jobs_lease_idx
  ON control_plane.tenant_deletion_jobs (status, lease_expires_at)
  WHERE mode = 'purge';

-- Heartbeats must represent every replica independently.
ALTER TABLE control_plane.service_heartbeats
  DROP CONSTRAINT IF EXISTS service_heartbeats_pkey;
ALTER TABLE control_plane.service_heartbeats
  ADD CONSTRAINT service_heartbeats_pkey PRIMARY KEY (service_name, instance_id);

-- Scheduled records are not current entitlements until their start time.
-- Existing constraints are VARCHAR-based, so no enum change is required.
CREATE INDEX IF NOT EXISTS subscriptions_scheduled_start_idx
  ON control_plane.subscriptions (starts_at, tenant_id)
  WHERE status = 'scheduled';

-- Preserve full access for tenants that predate commercial plan enforcement.
-- New tenants receive a Starter trial during provisioning.
INSERT INTO control_plane.subscriptions
  (tenant_id, plan_id, status, starts_at, assigned_by, notes)
SELECT tenant.id, plan.id, 'active', NOW(), NULL,
       'Automatic Enterprise compatibility assignment during Phase 12 hardening'
FROM control_plane.tenants tenant
JOIN control_plane.plans plan ON plan.code = 'ENTERPRISE'
WHERE tenant.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM control_plane.subscriptions current_subscription
    WHERE current_subscription.tenant_id = tenant.id
      AND current_subscription.status IN ('active', 'trial', 'paused')
      AND current_subscription.starts_at <= NOW()
      AND (current_subscription.ends_at IS NULL OR current_subscription.ends_at > NOW())
  );

-- Storage upload APIs are not yet part of this repository, so do not present an
-- unenforced numerical storage quota as a commercial guarantee.
UPDATE control_plane.plans
SET entitlements = COALESCE(entitlements, '{}'::jsonb) - 'storageGb',
    updated_at = NOW()
WHERE entitlements ? 'storageGb';
