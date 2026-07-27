import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as controlPlaneSchema from './schema/control-plane.js';
import * as tenantSchema from './schema/tenant.js';

let _db = null;
let _queryClient = null;

/**
 * Get the database client (lazy initialization).
 * Only connects when first accessed.
 */
export function getDb() {
  if (!_db) {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    _queryClient = postgres(DATABASE_URL);
    _db = drizzle(_queryClient, {
      schema: {
        ...controlPlaneSchema,
        ...tenantSchema,
      },
    });
  }
  return _db;
}

/**
 * Create a tenant-scoped database client.
 * All queries through this client are automatically scoped to the tenant schema.
 */
export function createTenantDb(schemaName) {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const tenantClient = postgres(DATABASE_URL, {
    options: { search_path: `${schemaName},public` },
  });
  return drizzle(tenantClient, {
    schema: { ...tenantSchema },
  });
}
