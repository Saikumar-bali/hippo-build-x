import { Permission } from '../permissions/index.js';

/**
 * Check if the tenant context has the required permission.
 */
export function checkPermission(ctx, permission) {
  if (ctx.permissions.includes(permission)) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Missing permission: ${permission}` };
}

/**
 * Check if the tenant context has ANY of the required permissions.
 */
export function checkAnyPermission(ctx, permissions) {
  const hasAny = permissions.some((p) => ctx.permissions.includes(p));
  if (hasAny) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Missing any of permissions: ${permissions.join(', ')}` };
}

/**
 * Check if the tenant context has ALL of the required permissions.
 */
export function checkAllPermissions(ctx, permissions) {
  const missing = permissions.filter((p) => !ctx.permissions.includes(p));
  if (missing.length === 0) {
    return { allowed: true };
  }
  return { allowed: false, reason: `Missing permissions: ${missing.join(', ')}` };
}

/**
 * Enforce a permission, throwing if not allowed.
 */
export function enforcePermission(ctx, permission) {
  const result = checkPermission(ctx, permission);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
}
