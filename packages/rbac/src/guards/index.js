import { Permission } from '../permissions/index.js';
import { AppError, ErrorCode } from '@hippo/shared';

const PERMISSION_MODULES = Object.freeze({
  project: 'projects',
  unit: 'projects',
  task: 'projects',
  boq: 'projects',
  drawing: 'projects',
  rfi: 'projects',
  issue: 'projects',
  crm: 'crm',
  progress: 'progress',
  payment: 'billing',
  finance: 'finance',
  inventory: 'inventory',
  grn: 'inventory',
  material: 'inventory',
  procurement: 'procurement',
  vendor: 'procurement',
  dashboard: 'dashboards',
  ai: 'ai',
  hrms: 'hrms',
  employee: 'hrms',
  payroll: 'hrms',
  attendance: 'hrms',
});

export function permissionModule(permission) {
  return PERMISSION_MODULES[String(permission || '').split('.')[0]] || null;
}

/**
 * @param {{ permissions?: string[], roles?: string[], modules?: Record<string, boolean>, moduleDecisions?: Record<string, object> }} ctx
 * @param {string} permission
 */
export function checkPermission(ctx, permission) {
  const moduleName = permissionModule(permission);
  if (moduleName && ctx.modules?.[moduleName] === false) {
    const decision = ctx.moduleDecisions?.[moduleName];
    return {
      allowed: false,
      reason: decision?.reason || `${moduleName} is disabled for this company`,
      module: moduleName,
      source: decision?.source || 'platform',
    };
  }

  const perms = ctx.permissions || [];
  if (perms.includes('*') || perms.includes(permission)) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Missing permission: ${permission}` };
}

export function checkAnyPermission(ctx, permissions) {
  const hasAny = permissions.some((p) => checkPermission(ctx, p).allowed);
  if (hasAny) return { allowed: true };
  return { allowed: false, reason: `Missing any of permissions: ${permissions.join(', ')}` };
}

export function checkAllPermissions(ctx, permissions) {
  const missing = permissions.filter((p) => !checkPermission(ctx, p).allowed);
  if (missing.length === 0) return { allowed: true };
  return { allowed: false, reason: `Missing permissions: ${missing.join(', ')}` };
}

export function enforcePermission(ctx, permission) {
  const result = checkPermission(ctx, permission);
  if (!result.allowed) {
    throw new AppError(ErrorCode.INSUFFICIENT_PERMISSION, result.reason, 403, {
      module: result.module,
      source: result.source,
    });
  }
}

/**
 * Auditor role is read-only for mutating HTTP methods.
 */
export function enforceNotAuditorWrite(ctx, method) {
  const roles = ctx.roles || [];
  const isAuditorOnly =
    roles.includes('Auditor') && !roles.includes('Administrator') && !roles.includes('admin');
  const auditor =
    roles.some((r) => String(r).toLowerCase() === 'auditor') &&
    !roles.some((r) => ['administrator', 'admin'].includes(String(r).toLowerCase()));

  if ((isAuditorOnly || auditor) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new AppError(ErrorCode.FORBIDDEN, 'Auditor cannot perform write operations', 403);
  }
}

export function hasPermission(ctx, permission) {
  return checkPermission(ctx, permission).allowed;
}

export { Permission };