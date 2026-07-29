#!/usr/bin/env node
/**
 * Seed the Green Valley Developers demo tenant via the real provisioner.
 * Usage: node src/scripts/seed.js
 */
import {
  runControlPlaneMigrations,
  toSchemaName,
  provisionTenantSchema,
  closeDb,
} from '../migrations/index.js';
import { getSql } from '../client.js';
import { TENANT_STATUS } from '../schema/control-plane.js';
import {
  seedPlatformSuperAdmin,
  PLATFORM_SUPER_ADMIN,
} from '../seed/platform.js';

const DEMO = {
  name: 'Green Valley Developers',
  slug: 'green-valley',
  adminEmail: 'admin@greenvalley.example',
  adminName: 'Green Valley Admin',
};

await runControlPlaneMigrations();
const platformAdmin = await seedPlatformSuperAdmin();
const sql = getSql();
const schemaName = toSchemaName(DEMO.slug);

const existing = await sql`
  SELECT id, status, schema_name FROM tenants
  WHERE slug = ${DEMO.slug} AND deleted_at IS NULL
  LIMIT 1
`;

let tenantId;
if (existing.length === 0) {
  const [tenant] = await sql`
    INSERT INTO tenants (name, slug, schema_name, status)
    VALUES (${DEMO.name}, ${DEMO.slug}, ${schemaName}, ${TENANT_STATUS.PROVISIONING})
    RETURNING id
  `;
  tenantId = tenant.id;
} else {
  tenantId = existing[0].id;
  await sql`
    UPDATE tenants
    SET status = ${TENANT_STATUS.PROVISIONING}, updated_at = NOW()
    WHERE id = ${tenantId}
  `;
}

const result = await provisionTenantSchema(tenantId, schemaName, {
  adminEmail: DEMO.adminEmail,
  adminName: DEMO.adminName,
  password: 'Admin@12345',
  seedDemoUsers: true,
});

console.log(
  JSON.stringify({
    ok: true,
    platformSuperAdmin: {
      email: PLATFORM_SUPER_ADMIN.email,
      password: PLATFORM_SUPER_ADMIN.password,
      id: platformAdmin.id,
    },
    demo: DEMO,
    ...result,
  }),
);
await closeDb();
