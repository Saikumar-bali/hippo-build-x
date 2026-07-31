-- Platform audit evidence is append-only. Enforce this invariant in PostgreSQL
-- so accidental future privilege changes cannot permit history rewriting.

CREATE OR REPLACE FUNCTION control_plane.reject_platform_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS platform_audit_logs_append_only
  ON control_plane.platform_audit_logs;
CREATE TRIGGER platform_audit_logs_append_only
BEFORE UPDATE OR DELETE ON control_plane.platform_audit_logs
FOR EACH ROW
EXECUTE FUNCTION control_plane.reject_platform_audit_mutation();
