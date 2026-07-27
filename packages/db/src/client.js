import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as controlPlaneSchema from './schema/control-plane.js';
import * as tenantSchema from './schema/tenant.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const queryClient = postgres(DATABASE_URL);

export const db = drizzle(queryClient, {
  schema: {
    ...controlPlaneSchema,
    ...tenantSchema,
  },
});

/**
 * Create a tenant-scoped database client.
 * All queries through this client are automatically scoped to the tenant schema.
 */
export function createTenantDb(schemaName) {
  const tenantClient = postgres(DATABASE_URL, {
    options: { search_path: `${schemaName},public` },
  });
  return drizzle(tenantClient, {
    schema: { ...tenantSchema },
  });
}
