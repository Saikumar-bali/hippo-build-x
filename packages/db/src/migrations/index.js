import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql, closeDb } from '../client.js';
import { TENANT_STATUS } from '../schema/control-plane.js';
import { toSchemaName, toTenantSchemaName, assertSafeSchemaName } from './schema-name.js';
import { seedTenantDefaults } from '../seed/defaults.js';

export { toSchemaName, toTenantSchemaName, assertSafeSchemaName, seedTenantDefaults };

const root = dirname(fileURLToPath(import.meta.url));
const CONTROL_MIGRATION_LOCK = 864203501;
const filesIn = (dir) => readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
const bodyOf = (dir, file) => readFileSync(join(dir, file), 'utf8');
const checksumOf = (body) => createHash('sha256').update(body).digest('hex');

export async function runControlPlaneMigrations() {
  const sql = getSql();
  const dir = join(root, 'control');
  const files = filesIn(dir);

  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${CONTROL_MIGRATION_LOCK})`;
    await tx.unsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await tx.unsafe('CREATE SCHEMA IF NOT EXISTS control_plane');
    await tx.unsafe(`
      CREATE TABLE IF NOT EXISTS control_plane.control_plane_migrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        checksum VARCHAR(64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await tx.unsafe(`ALTER TABLE control_plane.control_plane_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)`);
    await tx.unsafe(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = 'control_plane_migrations' AND c.relkind = 'r'
        ) THEN
          INSERT INTO control_plane.control_plane_migrations (migration_name, applied_at)
          SELECT migration_name, applied_at FROM public.control_plane_migrations
          ON CONFLICT (migration_name) DO NOTHING;
        END IF;
      END $$
    `);

    const applied = await tx`SELECT migration_name, checksum FROM control_plane.control_plane_migrations`;
    const known = new Map(applied.map((row) => [row.migration_name, row.checksum]));
    const added = [];

    for (const file of files) {
      const body = bodyOf(dir, file);
      const checksum = checksumOf(body);
      if (known.has(file)) {
        const old = known.get(file);
        if (old && old !== checksum) throw new Error(`Control-plane migration checksum changed: ${file}`);
        if (!old) await tx`UPDATE control_plane.control_plane_migrations SET checksum = ${checksum} WHERE migration_name = ${file}`;
        continue;
      }
      await tx.unsafe(body);
      await tx`INSERT INTO control_plane.control_plane_migrations (migration_name, checksum) VALUES (${file}, ${checksum})`;
      added.push(file);
    }
    return { applied: added, total: files.length };
  });
}

async function prepareTenantLedger(sql, schemaName, tenantId) {
  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.unsafe(`CREATE TABLE IF NOT EXISTS _tenant_migrations (migration_name VARCHAR(255) PRIMARY KEY, checksum VARCHAR(64), applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const central = await tx`SELECT migration_name, checksum, applied_at FROM control_plane.tenant_migrations WHERE tenant_id = ${tenantId}`;
    for (const row of central) {
      await tx`INSERT INTO _tenant_migrations (migration_name, checksum, applied_at) VALUES (${row.migration_name}, ${row.checksum}, ${row.applied_at}) ON CONFLICT DO NOTHING`;
    }
  });
}

async function enforceTenantRls(sql, schemaName, tenantId) {
  await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.unsafe(`
      DO $$ DECLARE target RECORD; qualified TEXT; expected_tenant UUID := current_setting('app.tenant_id')::uuid;
      BEGIN
        FOR target IN
          SELECT t.table_schema, t.table_name FROM information_schema.tables t
          WHERE t.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
          AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name = 'tenant_id')
        LOOP
          qualified := format('%I.%I', target.table_schema, target.table_name);
          EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', qualified);
          EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', qualified);
          EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', qualified);
          EXECUTE format(
            'CREATE POLICY tenant_isolation ON %s USING (tenant_id = %L::uuid AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = %L::uuid AND tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
            qualified, expected_tenant, expected_tenant
          );
        END LOOP;
      END $$
    `);
  });
}

export async function runTenantMigrations(schemaName, tenantId) {
  assertSafeSchemaName(schemaName);
  if (!tenantId) throw new Error('tenantId is required to run tenant migrations');
  const sql = getSql();
  const dir = join(root, 'tenant');
  const files = filesIn(dir);
  await prepareTenantLedger(sql, schemaName, tenantId);

  const applied = await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return tx`SELECT migration_name, checksum FROM _tenant_migrations`;
  });
  const known = new Map(applied.map((row) => [row.migration_name, row.checksum]));
  const added = [];

  for (const file of files) {
    const body = bodyOf(dir, file);
    const checksum = checksumOf(body);
    if (known.has(file)) {
      const old = known.get(file);
      if (old && old !== checksum) throw new Error(`Tenant migration checksum changed for ${schemaName}: ${file}`);
      if (!old) {
        await sql.begin(async (tx) => {
          await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
          await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          await tx`UPDATE _tenant_migrations SET checksum = ${checksum} WHERE migration_name = ${file}`;
          await tx`UPDATE control_plane.tenant_migrations SET checksum = ${checksum} WHERE tenant_id = ${tenantId} AND migration_name = ${file}`;
        });
      }
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.unsafe(body);
      await tx`INSERT INTO _tenant_migrations (migration_name, checksum) VALUES (${file}, ${checksum})`;
      await tx`INSERT INTO control_plane.tenant_migrations (tenant_id, migration_name, checksum) VALUES (${tenantId}, ${file}, ${checksum}) ON CONFLICT (tenant_id, migration_name) DO UPDATE SET checksum = EXCLUDED.checksum`;
    });
    added.push(file);
  }

  await enforceTenantRls(sql, schemaName, tenantId);
  const migrationVersion = files.at(-1) || null;
  await sql`UPDATE control_plane.tenants SET migration_version = ${migrationVersion}, updated_at = NOW() WHERE id = ${tenantId}`;
  return { applied: added, total: files.length, migrationVersion };
}

export async function provisionTenantSchema(tenantId, schemaName, options = {}) {
  assertSafeSchemaName(schemaName);
  const sql = getSql();
  const onStep = typeof options.onStep === 'function' ? options.onStep : async () => {};
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  await onStep('schema_created');
  await runTenantMigrations(schemaName, tenantId);
  await onStep('migrations_applied');
  await seedTenantDefaults(schemaName, tenantId, {
    email: options.adminEmail,
    name: options.adminName,
    password: options.password,
    seedDemoUsers: options.seedDemoUsers,
  });
  await onStep('defaults_seeded');
  await sql`INSERT INTO control_plane.tenant_channels (tenant_id, channel_type, provider, verification_status) VALUES (${tenantId}, 'default', 'unconfigured', 'not_configured') ON CONFLICT (tenant_id, channel_type) DO NOTHING`;
  await onStep('channel_record_created');
  await sql`UPDATE control_plane.tenants SET status = ${TENANT_STATUS.ACTIVE}, data_location_status = 'ready', updated_at = NOW() WHERE id = ${tenantId}`;
  await onStep('active');
  return { tenantId, schemaName, status: TENANT_STATUS.ACTIVE };
}

export async function rollbackTenantProvisioning(schemaName, tenantId) {
  assertSafeSchemaName(schemaName);
  const sql = getSql();
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  if (tenantId) {
    await sql`DELETE FROM control_plane.tenant_migrations WHERE tenant_id = ${tenantId}`;
    await sql`UPDATE control_plane.tenants SET status = ${TENANT_STATUS.FAILED}, data_location_status = 'rollback_complete', updated_at = NOW() WHERE id = ${tenantId}`;
  }
  return { schemaName, status: TENANT_STATUS.FAILED };
}

export async function isControlPlaneReady() {
  try {
    const rows = await getSql()`SELECT 1 FROM information_schema.tables WHERE table_schema = 'control_plane' AND table_name = 'tenants' LIMIT 1`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export { closeDb };
