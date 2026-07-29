import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSql, closeDb } from '../client.js';
import { TENANT_STATUS } from '../schema/control-plane.js';
import { toSchemaName, assertSafeSchemaName } from './schema-name.js';
import { seedTenantDefaults } from '../seed/defaults.js';

export { toSchemaName, assertSafeSchemaName, seedTenantDefaults };

const __dirname = dirname(fileURLToPath(import.meta.url));

function listSqlFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function readMigration(dir, name) {
  return readFileSync(join(dir, name), 'utf8');
}

/**
 * Apply pending control-plane migrations to the public schema.
 */
export async function runControlPlaneMigrations() {
  const sql = getSql();
  const dir = join(__dirname, 'control');
  const files = listSqlFiles(dir);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS control_plane_migrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await sql`
    SELECT migration_name FROM control_plane_migrations
  `;
  const appliedSet = new Set(applied.map((r) => r.migration_name));

  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const body = readMigration(dir, file);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`
        INSERT INTO control_plane_migrations (migration_name)
        VALUES (${file})
        ON CONFLICT (migration_name) DO NOTHING
      `;
    });
  }

  return { applied: files.filter((f) => !appliedSet.has(f)), total: files.length };
}

/**
 * Run pending tenant migrations for a schema.
 * @param {string} schemaName
 * @param {string} [tenantId]
 */
export async function runTenantMigrations(schemaName, tenantId) {
  assertSafeSchemaName(schemaName);
  const sql = getSql();
  const dir = join(__dirname, 'tenant');
  const files = listSqlFiles(dir);

  await sql.unsafe(`SET search_path TO "${schemaName}", public`);

  let appliedSet = new Set();
  if (tenantId) {
    const applied = await sql`
      SELECT migration_name FROM public.tenant_migrations
      WHERE tenant_id = ${tenantId}
    `;
    appliedSet = new Set(applied.map((r) => r.migration_name));
  }

  const newlyApplied = [];
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const body = readMigration(dir, file);
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`);
      await tx.unsafe(body);
      if (tenantId) {
        await tx`
          INSERT INTO public.tenant_migrations (tenant_id, migration_name)
          VALUES (${tenantId}, ${file})
          ON CONFLICT (tenant_id, migration_name) DO NOTHING
        `;
      }
    });
    newlyApplied.push(file);
  }

  await sql.unsafe(`SET search_path TO public`);
  return { applied: newlyApplied, total: files.length };
}

/**
 * Provision a new tenant schema with all required tables and defaults.
 * Idempotent — safe to retry.
 * @param {string} tenantId
 * @param {string} schemaName
 * @param {{ adminEmail?: string, adminName?: string, password?: string, seedDemoUsers?: boolean }} [options]
 */
export async function provisionTenantSchema(tenantId, schemaName, options = {}) {
  assertSafeSchemaName(schemaName);
  const sql = getSql();

  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  await runTenantMigrations(schemaName, tenantId);
  await seedTenantDefaults(schemaName, tenantId, {
    email: options.adminEmail,
    name: options.adminName,
    password: options.password,
    seedDemoUsers: options.seedDemoUsers,
  });

  await sql`
    UPDATE tenants
    SET status = ${TENANT_STATUS.ACTIVE}, updated_at = NOW()
    WHERE id = ${tenantId}
  `;

  return { tenantId, schemaName, status: TENANT_STATUS.ACTIVE };
}

/**
 * Rollback a failed tenant provisioning by dropping the schema and marking failed.
 * @param {string} schemaName
 * @param {string} [tenantId]
 */
export async function rollbackTenantProvisioning(schemaName, tenantId) {
  assertSafeSchemaName(schemaName);
  const sql = getSql();

  await sql.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

  if (tenantId) {
    await sql`
      DELETE FROM tenant_migrations WHERE tenant_id = ${tenantId}
    `;
    await sql`
      UPDATE tenants
      SET status = ${TENANT_STATUS.FAILED}, updated_at = NOW()
      WHERE id = ${tenantId}
    `;
  }

  return { schemaName, status: TENANT_STATUS.FAILED };
}

/**
 * Check whether control-plane baseline is applied.
 */
export async function isControlPlaneReady() {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tenants'
      LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export { closeDb };
