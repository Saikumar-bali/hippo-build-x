-- PRD §5 locked multi-tenancy control plane.
-- Existing installations are moved in-place; public compatibility views are
-- retained for one release so rolling application instances can drain safely.

CREATE SCHEMA IF NOT EXISTS control_plane;

DO $$
BEGIN
  IF to_regclass('control_plane.tenants') IS NULL
     AND to_regclass('public.tenants') IS NOT NULL THEN
    ALTER TABLE public.tenants SET SCHEMA control_plane;
  END IF;

  IF to_regclass('control_plane.tenant_migrations') IS NULL
     AND to_regclass('public.tenant_migrations') IS NOT NULL THEN
    ALTER TABLE public.tenant_migrations SET SCHEMA control_plane;
  END IF;

  IF to_regclass('control_plane.platform_users') IS NULL
     AND to_regclass('public.platform_users') IS NOT NULL THEN
    ALTER TABLE public.platform_users SET SCHEMA control_plane;
  END IF;
END $$;

ALTER TABLE control_plane.tenants
  ADD COLUMN IF NOT EXISTS isolation_mode VARCHAR(50) NOT NULL DEFAULT 'shared_schema',
  ADD COLUMN IF NOT EXISTS database_secret_ref TEXT,
  ADD COLUMN IF NOT EXISTS database_region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS migration_version VARCHAR(255),
  ADD COLUMN IF NOT EXISTS data_location_status VARCHAR(50) NOT NULL DEFAULT 'ready';

ALTER TABLE control_plane.tenant_migrations
  ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);

CREATE TABLE IF NOT EXISTS control_plane.provisioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES control_plane.tenants(id),
  job_type VARCHAR(80) NOT NULL DEFAULT 'tenant.provision',
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  current_step VARCHAR(80) NOT NULL DEFAULT 'registered',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  bullmq_job_id VARCHAR(255),
  requested_by UUID,
  error_code VARCHAR(100),
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provisioning_jobs_tenant_created
  ON control_plane.provisioning_jobs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provisioning_jobs_status
  ON control_plane.provisioning_jobs (status, updated_at);

CREATE TABLE IF NOT EXISTS control_plane.tenant_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES control_plane.tenants(id),
  channel_type VARCHAR(50) NOT NULL,
  provider VARCHAR(100) NOT NULL DEFAULT 'unconfigured',
  encrypted_credentials TEXT,
  encryption_key_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  non_secret_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT false,
  verification_status VARCHAR(50) NOT NULL DEFAULT 'not_configured',
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel_type)
);

-- Phase 12 owns the management APIs and lifecycle behavior for these tables.
-- Creating their stable control-plane shape now prevents another isolation
-- redesign when dedicated databases and entitlements arrive.
CREATE TABLE IF NOT EXISTS control_plane.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  entitlements JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS control_plane.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES control_plane.tenants(id),
  plan_id UUID NOT NULL REFERENCES control_plane.plans(id),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS control_plane.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES control_plane.tenants(id),
  flag_key VARCHAR(150) NOT NULL,
  forced_value BOOLEAN,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_tenant_key
  ON control_plane.feature_flags (tenant_id, flag_key)
  WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_global_key
  ON control_plane.feature_flags (flag_key)
  WHERE tenant_id IS NULL;

-- Read compatibility only. All new code explicitly targets control_plane.
DROP VIEW IF EXISTS public.tenants;
CREATE VIEW public.tenants AS SELECT * FROM control_plane.tenants;

DROP VIEW IF EXISTS public.tenant_migrations;
CREATE VIEW public.tenant_migrations AS SELECT * FROM control_plane.tenant_migrations;

DROP VIEW IF EXISTS public.platform_users;
CREATE VIEW public.platform_users AS SELECT * FROM control_plane.platform_users;

COMMENT ON SCHEMA control_plane IS
  'Shared SaaS control plane. Tenant business data must never be stored here.';
