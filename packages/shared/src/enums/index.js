/**
 * Shared enums used across the application.
 */

export const TenantStatus = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
});

export const UserStatus = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
});

export const AuditAction = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
});

export const EntityType = Object.freeze({
  USER: 'user',
  ROLE: 'role',
  TENANT: 'tenant',
  PROJECT: 'project',
  UNIT: 'unit',
  LEAD: 'lead',
  PAYMENT: 'payment',
});

export const FeatureFlag = Object.freeze({
  CRM_ENABLED: 'crm.enabled',
  CRM_PIPELINE: 'crm.pipeline.enabled',
  CONSTRUCTION_PROGRESS: 'construction.progress.enabled',
  PAYMENT_ENGINE: 'payment.engine.enabled',
  CUSTOMER_PORTAL: 'customer.portal.enabled',
  INVENTORY: 'inventory.enabled',
  AI_COPILOT: 'ai.copilot.enabled',
});
