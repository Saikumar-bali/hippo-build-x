import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * Control plane schema — shared across all tenants.
 * Stores tenant registry, provisioning state, and global configuration.
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  schemaName: varchar('schema_name', { length: 100 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  branding: jsonb('branding'),
  featureFlags: jsonb('feature_flags'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const tenantMigrations = pgTable('tenant_migrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  migrationName: varchar('migration_name', { length: 255 }).notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
