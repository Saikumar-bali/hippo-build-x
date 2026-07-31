import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as controlPlaneSchema from './schema/control-plane.js';

export const CONTROL_PLANE_SCHEMA = 'control_plane';

let _sql = null;
let _migrationSql = null;
let _db = null;

/** Restricted NOSUPERUSER/NOBYPASSRLS runtime connection. */
export function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = postgres(url, { max: 10 });
  }
  return _sql;
}

/**
 * Operator connection used only by checked-in migration/provisioning code.
 * Development/test may deliberately use the runtime URL as a fallback.
 */
export function getMigrationSql() {
  if (!_migrationSql) {
    const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
    if (process.env.NODE_ENV === 'production' && !process.env.MIGRATION_DATABASE_URL) {
      throw new Error('MIGRATION_DATABASE_URL is required in production');
    }
    _migrationSql = postgres(url, { max: 3 });
  }
  return _migrationSql;
}

export function getDb() {
  if (!_db) _db = drizzle(getSql(), { schema: controlPlaneSchema });
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

export function createControlPlaneSql() {
  const sql = getSql();
  async function query(strings, ...values) {
    return sql.begin(async (tx) => {
      await bindControlPlane(tx);
      return typeof strings === 'string' ? tx.unsafe(strings, values) : tx(strings, ...values);
    });
  }
  query.unsafe = (text, params = []) =>
    sql.begin(async (tx) => {
      await bindControlPlane(tx);
      return tx.unsafe(text, params);
    });
  query.begin = (callback) =>
    sql.begin(async (tx) => {
      await bindControlPlane(tx);
      return callback(tx);
    });
  query.snapshot = (callback) =>
    sql.begin('isolation level repeatable read read only', async (tx) => {
      await bindControlPlane(tx);
      return callback(tx);
    });
  query.schemaName = CONTROL_PLANE_SCHEMA;
  return query;
}

export function createTenantSql(schemaName, tenantId) {
  if (!schemaName || !/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Invalid tenant schema: ${schemaName}`);
  }
  assertTenantId(tenantId);
  const sql = getSql();
  async function query(strings, ...values) {
    return sql.begin(async (tx) => {
      await bindTenant(tx, schemaName, tenantId);
      return typeof strings === 'string' ? tx.unsafe(strings, values) : tx(strings, ...values);
    });
  }
  query.unsafe = (text, params = []) =>
    sql.begin(async (tx) => {
      await bindTenant(tx, schemaName, tenantId);
      return tx.unsafe(text, params);
    });
  query.begin = (callback) =>
    sql.begin(async (tx) => {
      await bindTenant(tx, schemaName, tenantId);
      return callback(tx);
    });
  query.snapshot = (callback) =>
    sql.begin('isolation level repeatable read read only', async (tx) => {
      await bindTenant(tx, schemaName, tenantId);
      return callback(tx);
    });
  query.schemaName = schemaName;
  query.tenantId = tenantId;
  return query;
}

export async function withTenantTransaction(schemaName, tenantId, callback) {
  return createTenantSql(schemaName, tenantId).begin(callback);
}

export function createTenantDb() {
  throw new Error('createTenantDb is disabled; use createTenantSql/withTenantTransaction');
}

export async function pingDatabase() {
  const [row] = await getSql()`SELECT 1 AS ok`;
  return row?.ok === 1;
}

export async function closeDb() {
  const clients = [_sql, _migrationSql].filter(Boolean);
  await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
  _sql = null;
  _migrationSql = null;
  _db = null;
}
