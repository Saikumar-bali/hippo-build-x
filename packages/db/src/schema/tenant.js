import { pgTable, uuid, varchar, timestamp, boolean, text, jsonb } from 'drizzle-orm/pg-core';

/**
 * Tenant-scoped base columns.
 * All tenant tables should spread these columns.
 */
export const tenantBaseColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

/**
 * Example tenant-scoped table: users
 * In production, each tenant gets their own schema with these tables.
 */
export const users = pgTable('users', {
  ...tenantBaseColumns,
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const roles = pgTable('roles', {
  ...tenantBaseColumns,
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  permissions: jsonb('permissions').notNull().default([]),
  isSystem: boolean('is_system').notNull().default(false),
});

export const userRoles = pgTable('user_roles', {
  ...tenantBaseColumns,
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id),
  projectId: uuid('project_id'),
  locationId: uuid('location_id'),
});
