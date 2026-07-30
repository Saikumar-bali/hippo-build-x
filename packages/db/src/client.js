import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as controlPlaneSchema from './schema/control-plane.js';

export const CONTROL_PLANE_SCHEMA = 'control_plane';

let _sql = null;
let _db = null;

/**
 * Get the raw postgres.js client used only by migrations, health checks and
 * context factories. Business modules must use createControlPlaneSql or
 * createTenantSql instead of issuing global queries.
 */
export function getSql() {
  if (!_sql) {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    _sql = postgres(DATABASE_URL, { max: 10 });
  }
  return _sql;
}

/**
 * Control-plane Drizzle client. Tenant tables are deliberately excluded so a
 * global Drizzle client can never become an accidental tenant data path.
 */
export function getDb() {
  if (!_db) {
    _db = drizzle(getSql(), { schema: controlPlaneSchema });
  }
  return _db;
}

function assertTenantId(tenantId) {
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    throw new Error('A valid tenantId is required for tenant data access');
  }
}

async function bindControlPlane(tx) {
  await tx.unsafe(`SET LOCAL search_path TO "${CONTROL_PLANE_SCHEMA}", pg_catalog`);
}

async function bindTenant(tx, schemaName, tenantId) {
  await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
  await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
}

/**
 * Create a control-plane SQL helper. Every query is transaction-bound and the
 * search path excludes public.
 */
export function createControlPlaneSql() {
  const sql = getSql();

  async function controlQuery(strings, ...values) {
    return sql.begin(async (tx) => {
      await bindControlPlane(tx);
      if (typeof strings === 'string') return tx.unsafe(strings, values);
      return tx(strings, ...values);
    });
  }

  controlQuery.unsafe = async (query, params = []) =>
    sql.begin(async (tx) => {
      await bindControlPlane(tx);
      return tx.unsafe(query, params);
    });

  controlQuery.begin = async (callback) =>
    sql.begin(async (tx) => {
      await bindControlPlane(tx);
      return callback(tx);
    });

  controlQuery.schemaName = CONTROL_PLANE_SCHEMA;
  return controlQuery;
}

/**
 * Create a tenant-scoped SQL helper. A tenant id is mandatory because tenant
 * tables use forced RLS as a second isolation boundary in addition to schemas.
 * @param {string} schemaName
 * @param {string} tenantId
 */
export function createTenantSql(schemaName, tenantId) {
  if (!schemaName || !/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Invalid tenant schema: ${schemaName}`);
  }
  assertTenantId(tenantId);
  const sql = getSql();

  async function tenantQuery(strings, ...values) {
    return sql.begin(async (tx) => {
      await bindTenant(tx, schemaName, tenantId);
      if (typeof strings === 'string') return tx.unsafe(strings, values);
      return tx(strings, ...values);
    });
  }

  tenantQuery.unsafe = async (query, params = []) =>
    sql.begin(async (tx) => {
      await bindTenant(tx, schemaName, tenantId);
      return tx.unsafe(query, params);
    });

  tenantQuery.begin = async (callback) =>
    sql.begin(async (tx) => {
      await bindTenant(tx, schemaName, tenantId);
      return callback(tx);
    });

  tenantQuery.schemaName = schemaName;
  tenantQuery.tenantId = tenantId;
  return tenantQuery;
}

/**
 * Execute multiple tenant operations in one transaction.
 */
export async function withTenantTransaction(schemaName, tenantId, callback) {
  return createTenantSql(schemaName, tenantId).begin(callback);
}

/**
 * Removed by the locked tenancy architecture. A long-lived Drizzle client
 * cannot safely carry request-local tenant identity or forced-RLS context.
 */
export function createTenantDb() {
  throw new Error('createTenantDb is disabled; use createTenantSql/withTenantTransaction');
}

export async function pingDatabase() {
  const sql = getSql();
  const [row] = await sql`SELECT 1 AS ok`;
  return row?.ok === 1;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _db = null;
  }
}
