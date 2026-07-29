-- Ensure control-plane columns match Phase 0 contract (safe on fresh and existing DBs)

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS schema_name VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill schema_name for any legacy rows
UPDATE tenants
SET schema_name = 'tenant_' || regexp_replace(lower(slug), '[^a-z0-9_]+', '_', 'g')
WHERE schema_name IS NULL;

-- Enforce NOT NULL + unique once backfilled
DO $$
BEGIN
  ALTER TABLE tenants ALTER COLUMN schema_name SET NOT NULL;
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_schema_name_key'
  ) THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_schema_name_key UNIQUE (schema_name);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Ensure tenant_migrations unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_migrations_tenant_id_migration_name_key'
  ) THEN
    ALTER TABLE tenant_migrations
      ADD CONSTRAINT tenant_migrations_tenant_id_migration_name_key UNIQUE (tenant_id, migration_name);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
