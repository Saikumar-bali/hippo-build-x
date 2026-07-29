import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError, ErrorCode } from '@hippo/shared';

/**
 * @typedef {object} RequestContext
 * @property {string} requestId
 * @property {string} [tenantId]
 * @property {string} [schemaName]
 * @property {string} [slug]
 * @property {string} [userId]
 * @property {string} [email]
 * @property {string} [name]
 * @property {string} [sessionId]
 * @property {string[]} [roles]
 * @property {string[]} [permissions]
 * @property {string[]} [projectIds]
 * @property {string[]} [locationIds]
 * @property {boolean} [isPlatform]
 * @property {object} [platformUser]
 * @property {string} [authMethod]
 */

/** @type {AsyncLocalStorage<RequestContext>} */
export const requestContext = new AsyncLocalStorage();

export function getStore() {
  return requestContext.getStore();
}

export function getRequestContext() {
  const ctx = requestContext.getStore();
  if (!ctx) {
    throw new AppError(
      ErrorCode.TENANT_CONTEXT_REQUIRED,
      'No request context available',
      500,
    );
  }
  return ctx;
}

export function getRequestId() {
  try {
    return getRequestContext().requestId;
  } catch {
    return crypto.randomUUID();
  }
}

export function requireTenantContext() {
  const ctx = getRequestContext();
  if (!ctx.tenantId || !ctx.schemaName) {
    throw new AppError(
      ErrorCode.TENANT_CONTEXT_REQUIRED,
      'Tenant context is required for this operation',
      400,
    );
  }
  return ctx;
}

export function requireAuthContext() {
  const ctx = requireTenantContext();
  if (!ctx.userId) {
    throw AppError.unauthorized('Authentication required');
  }
  return ctx;
}

export function runWithContext(ctx, fn) {
  return requestContext.run(ctx, fn);
}
