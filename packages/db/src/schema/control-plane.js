import {
  pgSchema,
  uuid,
  varchar,
  timestamp,
  jsonb,
  unique,
  primaryKey,
  text,
  integer,
  boolean,
  bigint,
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
  storagePrefix: text('storage_prefix').notNull(),
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

export const plans = controlPlane.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  monthlyPriceCents: integer('monthly_price_cents').notNull().default(0),
  annualPriceCents: integer('annual_price_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  trialDays: integer('trial_days').notNull().default(0),
  displayOrder: integer('display_order').notNull().default(0),
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
  assignedBy: uuid('assigned_by').references(() => platformUsers.id),
  notes: text('notes'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
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

export const platformAuditLogs = controlPlane.table('platform_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => platformUsers.id),
  actorEmail: varchar('actor_email', { length: 255 }),
  action: varchar('action', { length: 120 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: text('entity_id'),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  metadata: jsonb('metadata').notNull().default({}),
  requestId: varchar('request_id', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantExportJobs = controlPlane.table('tenant_export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  status: varchar('status', { length: 50 }).notNull().default('queued'),
  format: varchar('format', { length: 20 }).notNull().default('json'),
  tableCount: integer('table_count').notNull().default(0),
  rowCount: bigint('row_count', { mode: 'number' }).notNull().default(0),
  byteCount: bigint('byte_count', { mode: 'number' }).notNull().default(0),
  requestedBy: uuid('requested_by').references(() => platformUsers.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  manifest: jsonb('manifest').notNull().default({}),
});

export const tenantDeletionJobs = controlPlane.table('tenant_deletion_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  mode: varchar('mode', { length: 30 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('scheduled'),
  legalHold: boolean('legal_hold').notNull().default(false),
  requestedBy: uuid('requested_by').references(() => platformUsers.id),
  approvedBy: uuid('approved_by').references(() => platformUsers.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  leaseOwner: varchar('lease_owner', { length: 255 }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  destructionStartedAt: timestamp('destruction_started_at', { withTimezone: true }),
  storagePurgedAt: timestamp('storage_purged_at', { withTimezone: true }),
  schemaDroppedAt: timestamp('schema_dropped_at', { withTimezone: true }),
  reconciliationRequired: boolean('reconciliation_required').notNull().default(false),
  attemptCount: integer('attempt_count').notNull().default(0),
  reason: text('reason'),
  errorMessage: text('error_message'),
  evidence: jsonb('evidence').notNull().default({}),
});

export const serviceHeartbeats = controlPlane.table(
  'service_heartbeats',
  {
    serviceName: varchar('service_name', { length: 100 }).notNull(),
    instanceId: varchar('instance_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('healthy'),
    metadata: jsonb('metadata').notNull().default({}),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'service_heartbeats_pkey',
      columns: [table.serviceName, table.instanceId],
    }),
  ],
);

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
