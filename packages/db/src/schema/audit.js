import { pgTable, uuid, varchar, jsonb } from 'drizzle-orm/pg-core';
import { tenantBaseColumns } from './tenant.js';

/**
 * Audit log table — tenant-scoped.
 * Records all state-changing operations for compliance and traceability.
 */
export const auditLog = pgTable('audit_log', {
  ...tenantBaseColumns,
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  actorType: varchar('actor_type', { length: 50 }).notNull().default('user'),
  before: jsonb('before'),
  after: jsonb('after'),
  metadata: jsonb('metadata'),
  correlationId: uuid('correlation_id'),
  ipAddress: varchar('ip_address', { length: 45 }),
});
