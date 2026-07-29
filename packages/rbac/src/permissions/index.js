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

  // Property / projects (Phase 2)
  PROJECT_CREATE: 'project.create',
  PROJECT_READ: 'project.read',
  PROJECT_UPDATE: 'project.update',
  PROJECT_DELETE: 'project.delete',
  UNIT_CREATE: 'unit.create',
  UNIT_READ: 'unit.read',
  UNIT_UPDATE: 'unit.update',
  TASK_CREATE: 'task.create',
  TASK_READ: 'task.read',
  TASK_UPDATE: 'task.update',
  BOQ_MANAGE: 'boq.manage',
  DRAWING_MANAGE: 'drawing.manage',
  RFI_MANAGE: 'rfi.manage',
  ISSUE_MANAGE: 'issue.manage',

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
    Permission.PROJECT_CREATE,
    Permission.PROJECT_READ,
    Permission.PROJECT_UPDATE,
    Permission.UNIT_CREATE,
    Permission.UNIT_READ,
    Permission.UNIT_UPDATE,
    Permission.TASK_CREATE,
    Permission.TASK_READ,
    Permission.TASK_UPDATE,
    Permission.BOQ_MANAGE,
    Permission.DRAWING_MANAGE,
    Permission.RFI_MANAGE,
    Permission.ISSUE_MANAGE,
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
    Permission.PROJECT_READ,
    Permission.UNIT_READ,
  ],
  'site-engineer': [
    Permission.PROJECT_READ,
    Permission.UNIT_READ,
    Permission.TASK_READ,
    Permission.DRAWING_MANAGE,
    Permission.RFI_MANAGE,
    Permission.ISSUE_MANAGE,
    Permission.PROGRESS_SUBMIT,
    Permission.PROGRESS_READ,
    Permission.INVENTORY_READ,
  ],
  accountant: [
    Permission.PAYMENT_CREATE,
    Permission.PAYMENT_READ,
    Permission.PROJECT_READ,
    Permission.BOQ_MANAGE,
    Permission.AUDIT_READ,
  ],
  auditor: [
    Permission.USER_READ,
    Permission.PROJECT_READ,
    Permission.UNIT_READ,
    Permission.TASK_READ,
    Permission.CRM_LEAD_READ,
    Permission.PROGRESS_READ,
    Permission.PAYMENT_READ,
    Permission.INVENTORY_READ,
    Permission.AUDIT_READ,
  ],
};
