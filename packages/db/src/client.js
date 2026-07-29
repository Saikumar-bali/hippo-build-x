import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as controlPlaneSchema from './schema/control-plane.js';
import * as tenantSchema from './schema/tenant.js';
import * as auditSchema from './schema/audit.js';

let _sql = null;
let _db = null;

/**
 * Get the raw postgres.js SQL client (lazy).
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
 * Get the control-plane Drizzle client (public schema).
 */
export function getDb() {
  if (!_db) {
    _db = drizzle(getSql(), {
      schema: {
        ...controlPlaneSchema,
        ...tenantSchema,
        ...auditSchema,
      },
    });
  }
  return _db;
}

/**
 * Create a tenant-scoped SQL helper that always sets search_path.
 * @param {string} schemaName
 */
export function createTenantSql(schemaName) {
  if (!schemaName || !/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Invalid tenant schema: ${schemaName}`);
  }
  const sql = getSql();

  /**
   * @param {TemplateStringsArray|string} strings
   * @param {...unknown} values
   */
  async function tenantQuery(strings, ...values) {
    return sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`);
      if (typeof strings === 'string') {
        return tx.unsafe(strings, values);
      }
      return tx(strings, ...values);
    });
  }

  tenantQuery.unsafe = async (query, params = []) => {
    return sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`);
      return tx.unsafe(query, params);
    });
  };

  tenantQuery.schemaName = schemaName;
  return tenantQuery;
}

/**
 * Create a tenant-scoped Drizzle client.
 * @param {string} schemaName
 */
export function createTenantDb(schemaName) {
  if (!schemaName || !/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Invalid tenant schema: ${schemaName}`);
  }
  const tenantClient = postgres(process.env.DATABASE_URL, {
    max: 5,
    connection: {
      search_path: `${schemaName},public`,
    },
  });
  return drizzle(tenantClient, {
    schema: { ...tenantSchema, ...auditSchema },
  });
}

/**
 * Ping the database.
 */
export async function pingDatabase() {
  const sql = getSql();
  const [row] = await sql`SELECT 1 AS ok`;
  return row?.ok === 1;
}

/**
 * Close all database connections.
 */
export async function closeDb() {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _db = null;
  }
}
