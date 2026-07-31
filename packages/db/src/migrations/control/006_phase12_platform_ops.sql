-- Phase 12: commercial controls, platform operations, audit evidence and safe offboarding.

ALTER TABLE control_plane.plans
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_price_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE control_plane.subscriptions
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES control_plane.platform_users(id),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Historical installations may contain more than one current subscription.
-- Keep the newest current record and close older rows before enforcing the rule.
WITH ranked_current AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY starts_at DESC, created_at DESC, id DESC
    ) AS position
  FROM control_plane.subscriptions
  WHERE status IN ('active', 'trial', 'paused')
)
UPDATE control_plane.subscriptions subscription
SET status = 'cancelled',
    ends_at = COALESCE(subscription.ends_at, NOW()),
    cancelled_at = COALESCE(subscription.cancelled_at, NOW()),
    updated_at = NOW()
FROM ranked_current ranked
WHERE subscription.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_per_tenant_idx
  ON control_plane.subscriptions (tenant_id)
  WHERE status IN ('active', 'trial', 'paused');

CREATE INDEX IF NOT EXISTS subscriptions_plan_status_idx
  ON control_plane.subscriptions (plan_id, status, starts_at DESC);

CREATE TABLE IF NOT EXISTS control_plane.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES control_plane.platform_users(id),
  actor_email VARCHAR(255),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id TEXT,
  tenant_id UUID REFERENCES control_plane.tenants(id),
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  request_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_audit_logs_created_idx
  ON control_plane.platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_logs_tenant_created_idx
  ON control_plane.platform_audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_logs_action_idx
  ON control_plane.platform_audit_logs (action, created_at DESC);

CREATE TABLE IF NOT EXISTS control_plane.tenant_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES control_plane.tenants(id),
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  format VARCHAR(20) NOT NULL DEFAULT 'json',
  table_count INTEGER NOT NULL DEFAULT 0,
  row_count BIGINT NOT NULL DEFAULT 0,
  byte_count BIGINT NOT NULL DEFAULT 0,
  requested_by UUID REFERENCES control_plane.platform_users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  error_message TEXT,
  manifest JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS tenant_export_jobs_tenant_created_idx
  ON control_plane.tenant_export_jobs (tenant_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS tenant_export_jobs_status_idx
  ON control_plane.tenant_export_jobs (status, requested_at DESC);

CREATE TABLE IF NOT EXISTS control_plane.tenant_deletion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES control_plane.tenants(id),
  mode VARCHAR(30) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  requested_by UUID REFERENCES control_plane.platform_users(id),
  approved_by UUID REFERENCES control_plane.platform_users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  reason TEXT,
  error_message TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS tenant_deletion_jobs_tenant_created_idx
  ON control_plane.tenant_deletion_jobs (tenant_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS tenant_deletion_jobs_status_idx
  ON control_plane.tenant_deletion_jobs (status, scheduled_for);

CREATE TABLE IF NOT EXISTS control_plane.service_heartbeats (
  service_name VARCHAR(100) PRIMARY KEY,
  instance_id VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'healthy',
  metadata JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_heartbeats_last_seen_idx
  ON control_plane.service_heartbeats (last_seen_at DESC);

INSERT INTO control_plane.plans
  (code, name, description, status, monthly_price_cents, annual_price_cents,
   currency, trial_days, display_order, entitlements)
VALUES
  (
    'STARTER',
    'Starter',
    'For small construction teams starting with projects, CRM and customer communication.',
    'active',
    149900,
    1499000,
    'INR',
    14,
    10,
    '{"users":25,"projects":3,"storageGb":25,"modules":["projects","crm","progress","notifications"]}'::jsonb
  ),
  (
    'GROWTH',
    'Growth',
    'For growing developers that need finance, procurement, dashboards and wider team access.',
    'active',
    399900,
    3999000,
    'INR',
    14,
    20,
    '{"users":100,"projects":15,"storageGb":150,"modules":["projects","crm","progress","notifications","billing","finance","inventory","procurement","dashboards"]}'::jsonb
  ),
  (
    'ENTERPRISE',
    'Enterprise',
    'For multi-project organizations requiring advanced controls, custom limits and dedicated support.',
    'active',
    0,
    0,
    'INR',
    30,
    30,
    '{"users":-1,"projects":-1,"storageGb":1000,"modules":["all"],"prioritySupport":true}'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = COALESCE(control_plane.plans.description, EXCLUDED.description),
  currency = COALESCE(control_plane.plans.currency, EXCLUDED.currency),
  display_order = CASE
    WHEN control_plane.plans.display_order = 0 THEN EXCLUDED.display_order
    ELSE control_plane.plans.display_order
  END,
  updated_at = NOW();