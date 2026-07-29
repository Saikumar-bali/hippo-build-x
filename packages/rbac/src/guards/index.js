import { Permission } from '../permissions/index.js';
import { AppError, ErrorCode } from '@hippo/shared';

/**
 * @param {{ permissions?: string[], roles?: string[] }} ctx
 * @param {string} permission
 */
export function checkPermission(ctx, permission) {
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
    throw new AppError(ErrorCode.INSUFFICIENT_PERMISSION, result.reason, 403);
  }
}

/**
 * Auditor role is read-only for mutating HTTP methods.
 */
export function enforceNotAuditorWrite(ctx, method) {
  const roles = ctx.roles || [];
  const isAuditorOnly =
    roles.includes('Auditor') && !roles.includes('Administrator') && !roles.includes('admin');
  // Also check role key style
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
