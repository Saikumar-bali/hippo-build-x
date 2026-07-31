ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS storage_prefix TEXT;

CREATE OR REPLACE FUNCTION control_plane.set_tenant_storage_prefix()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.storage_prefix IS NULL OR btrim(NEW.storage_prefix) = '' THEN
    NEW.storage_prefix := 'tenants/' || NEW.id::text || '/';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_storage_prefix_trg ON control_plane.tenants;
CREATE TRIGGER tenants_storage_prefix_trg
BEFORE INSERT OR UPDATE OF id, storage_prefix
ON control_plane.tenants
FOR EACH ROW
EXECUTE FUNCTION control_plane.set_tenant_storage_prefix();

UPDATE tenants
SET storage_prefix = 'tenants/' || id::text || '/'
WHERE storage_prefix IS NULL OR btrim(storage_prefix) = '';

ALTER TABLE tenants
  ALTER COLUMN storage_prefix SET NOT NULL;

INSERT INTO tenant_channels
  (tenant_id, channel_type, provider, verification_status)
SELECT
  tenant.id,
  channel.channel_type,
  'unconfigured',
  'not_configured'
FROM tenants tenant
CROSS JOIN (
  VALUES ('email'), ('sms'), ('whatsapp')
) AS channel(channel_type)
WHERE tenant.deleted_at IS NULL
ON CONFLICT (tenant_id, channel_type) DO NOTHING;

DELETE FROM tenant_channels
WHERE channel_type = 'default'
  AND provider = 'unconfigured'
  AND encrypted_credentials IS NULL;

CREATE OR REPLACE FUNCTION control_plane.expand_default_tenant_channel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.channel_type = 'default'
     AND NEW.provider = 'unconfigured'
     AND NEW.encrypted_credentials IS NULL THEN
    INSERT INTO control_plane.tenant_channels
      (tenant_id, channel_type, provider, verification_status)
    VALUES
      (NEW.tenant_id, 'email', 'unconfigured', 'not_configured'),
      (NEW.tenant_id, 'sms', 'unconfigured', 'not_configured'),
      (NEW.tenant_id, 'whatsapp', 'unconfigured', 'not_configured')
    ON CONFLICT (tenant_id, channel_type) DO NOTHING;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_channels_expand_default_trg
  ON control_plane.tenant_channels;
CREATE TRIGGER tenant_channels_expand_default_trg
BEFORE INSERT
ON control_plane.tenant_channels
FOR EACH ROW
EXECUTE FUNCTION control_plane.expand_default_tenant_channel();

CREATE INDEX IF NOT EXISTS subscriptions_tenant_status_idx
  ON subscriptions (tenant_id, status, starts_at DESC);

CREATE INDEX IF NOT EXISTS provisioning_jobs_tenant_created_idx
  ON provisioning_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_channels_tenant_idx
  ON tenant_channels (tenant_id, channel_type);

CREATE INDEX IF NOT EXISTS feature_flags_tenant_idx
  ON feature_flags (tenant_id, flag_key);
