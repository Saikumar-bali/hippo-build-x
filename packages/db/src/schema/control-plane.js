import {
  pgSchema,
  uuid,
  varchar,
  timestamp,
  jsonb,
  unique,
  text,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';

export const controlPlane = pgSchema('control_plane');

export const tenants = controlPlane.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  schemaName: varchar('schema_name', { length: 100 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull().default('provisioning'),
  isolationMode: varchar('isolation_mode', { length: 50 }).notNull().default('shared_schema'),
  databaseSecretRef: text('database_secret_ref'),
  databaseRegion: varchar('database_region', { length: 100 }),
  migrationVersion: varchar('migration_version', { length: 255 }),
  dataLocationStatus: varchar('data_location_status', { length: 50 }).notNull().default('ready'),
  branding: jsonb('branding').notNull().default({}),
  featureFlags: jsonb('feature_flags').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const tenantMigrations = controlPlane.table(
  'tenant_migrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    migrationName: varchar('migration_name', { length: 255 }).notNull(),
    checksum: varchar('checksum', { length: 64 }),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('tenant_migrations_tenant_name_uq').on(table.tenantId, table.migrationName)],
);

export const controlPlaneMigrations = controlPlane.table('control_plane_migrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  migrationName: varchar('migration_name', { length: 255 }).notNull().unique(),
  checksum: varchar('checksum', { length: 64 }),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformUsers = controlPlane.table('platform_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 50 }).notNull().default('super_admin'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const provisioningJobs = controlPlane.table(
  'provisioning_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    jobType: varchar('job_type', { length: 80 }).notNull().default('tenant.provision'),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('queued'),
    currentStep: varchar('current_step', { length: 80 }).notNull().default('registered'),
    attemptCount: integer('attempt_count').notNull().default(0),
    bullmqJobId: varchar('bullmq_job_id', { length: 255 }),
    requestedBy: uuid('requested_by'),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    payload: jsonb('payload').notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('provisioning_jobs_idempotency_uq').on(table.idempotencyKey)],
);

export const tenantChannels = controlPlane.table(
  'tenant_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    channelType: varchar('channel_type', { length: 50 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull().default('unconfigured'),
    encryptedCredentials: text('encrypted_credentials'),
    encryptionKeyVersion: varchar('encryption_key_version', { length: 50 }).notNull().default('v1'),
    nonSecretConfig: jsonb('non_secret_config').notNull().default({}),
    enabled: boolean('enabled').notNull().default(false),
    verificationStatus: varchar('verification_status', { length: 50 })
      .notNull()
      .default('not_configured'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('tenant_channels_tenant_type_uq').on(table.tenantId, table.channelType)],
);

// Phase 12 ownership. Tables exist now so tenant routing and entitlement contracts
// do not require a later control-plane redesign; no Phase 12 management APIs ship here.
export const plans = controlPlane.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  entitlements: jsonb('entitlements').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = controlPlane.table('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlags = controlPlane.table('feature_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  flagKey: varchar('flag_key', { length: 150 }).notNull(),
  forcedValue: boolean('forced_value'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const TENANT_STATUS = Object.freeze({
  PROVISIONING: 'provisioning',
  ACTIVE: 'active',
  FAILED: 'failed',
  SUSPENDED: 'suspended',
});

export const ISOLATION_MODE = Object.freeze({
  SHARED_SCHEMA: 'shared_schema',
  DEDICATED_DATABASE: 'dedicated_database',
});
