-- Defense in depth for PRD §5. Schema routing is the primary boundary; forced
-- RLS prevents a schema-qualified query from reading or writing another tenant
-- when the runtime database role does not have BYPASSRLS.

DO $$
DECLARE
  target RECORD;
  qualified TEXT;
BEGIN
  FOR target IN
    SELECT t.table_schema, t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = current_schema()
      AND t.table_type = 'BASE TABLE'
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = t.table_schema
          AND c.table_name = t.table_name
          AND c.column_name = 'tenant_id'
      )
  LOOP
    qualified := format('%I.%I', target.table_schema, target.table_name);
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', qualified);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', qualified);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', qualified);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %s USING '
      || '(tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) '
      || 'WITH CHECK '
      || '(tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      qualified
    );
  END LOOP;
END $$;
