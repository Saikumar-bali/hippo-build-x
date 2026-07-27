/**
 * Permission definitions for the Construction ERP.
 * Format: module.resource.action
 */

export const Permission = Object.freeze({
  // User management
  USER_CREATE: 'user.create',
  USER_READ: 'user.read',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  // Role management
  ROLE_CREATE: 'role.create',
  ROLE_READ: 'role.read',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',

  // CRM
  CRM_LEAD_CREATE: 'crm.lead.create',
  CRM_LEAD_READ: 'crm.lead.read',
  CRM_LEAD_UPDATE: 'crm.lead.update',
  CRM_LEAD_DELETE: 'crm.lead.delete',
  CRM_LEAD_ASSIGN: 'crm.lead.assign',
  CRM_PIPELINE_MANAGE: 'crm.pipeline.manage',

  // Construction progress
  PROGRESS_SUBMIT: 'progress.submit',
  PROGRESS_APPROVE: 'progress.approve',
  PROGRESS_READ: 'progress.read',

  // Payments
  PAYMENT_CREATE: 'payment.create',
  PAYMENT_READ: 'payment.read',
  PAYMENT_APPROVE: 'payment.approve',

  // Inventory
  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',
  GRN_CREATE: 'grn.create',
  MATERIAL_ISSUE: 'material.issue',

  // KYC
  KYC_VIEW_FULL: 'kyc.view.full',
  KYC_VIEW_MASKED: 'kyc.view.masked',

  // Audit
  AUDIT_READ: 'audit.read',

  // Tenant admin
  TENANT_MANAGE: 'tenant.manage',
  TENANT_BRANDING: 'tenant.branding',
  FEATURE_FLAG_MANAGE: 'feature_flag.manage',
});

/**
 * Permission matrix: maps roles to their allowed permissions.
 */
export const DEFAULT_PERMISSION_MATRIX = {
  admin: Object.values(Permission),
  'project-manager': [
    Permission.USER_READ,
    Permission.CRM_LEAD_READ,
    Permission.PROGRESS_READ,
    Permission.PROGRESS_APPROVE,
    Permission.PAYMENT_READ,
    Permission.INVENTORY_READ,
    Permission.AUDIT_READ,
  ],
  'sales-executive': [
    Permission.CRM_LEAD_CREATE,
    Permission.CRM_LEAD_READ,
    Permission.CRM_LEAD_UPDATE,
    Permission.CRM_PIPELINE_MANAGE,
  ],
  'site-engineer': [
    Permission.PROGRESS_SUBMIT,
    Permission.PROGRESS_READ,
    Permission.INVENTORY_READ,
  ],
  accountant: [
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ,
    Permission.AUDIT_READ,
  ],
  auditor: [
    Permission.USER_READ,
    Permission.CRM_LEAD_READ,
    Permission.PROGRESS_READ,
    Permission.PAYMENT_READ,
    Permission.INVENTORY_READ,
    Permission.AUDIT_READ,
  ],
};
