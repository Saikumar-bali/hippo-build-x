import {
  successResponse as sharedSuccess,
  errorResponse as sharedError,
  AppError,
  ErrorCode,
  createLogger,
} from '@hippo/shared';
import {
  getRequestId,
  requireTenantContext,
  runWithContext,
  getStore,
} from './tenant-context.js';
import { getSql, createTenantSql } from '@hippo/db';
import { verifyAccessToken } from './auth.js';
import { extractAccessToken } from '@/modules/auth/cookie.js';
import { loadUserAuthz } from '@/modules/auth/session-service.js';
import { loadPlatformUser } from '@/modules/platform/platform-auth-service.js';
import { enforceNotAuditorWrite, enforcePermission } from '@hippo/rbac';
import { writeAuditLog } from '@/modules/audit/audit-service.js';

const log = createLogger({ service: 'web-api' });

export function successResponse(data, meta = {}, status = 200) {
  const body = sharedSuccess(data, meta, getRequestId());
  return Response.json(body, { status });
}

export function errorResponse(errorOrMessage, status = 500, code = ErrorCode.INTERNAL_ERROR) {
  if (errorOrMessage instanceof AppError) {
    const body = sharedError(
      [{ code: errorOrMessage.code, message: errorOrMessage.message, details: errorOrMessage.details }],
      {},
      getRequestId(),
    );
    return Response.json(body, { status: errorOrMessage.statusCode });
  }

  const message =
    typeof errorOrMessage === 'string'
      ? errorOrMessage
      : errorOrMessage?.message || 'Internal error';

  const body = sharedError([{ code, message }], {}, getRequestId());
  return Response.json(body, { status });
}

export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw AppError.validation('Invalid JSON body');
  }
}

export function controlPlaneSql() {
  return getSql();
}

export function tenantSql() {
  const { schemaName } = requireTenantContext();
  return createTenantSql(schemaName);
}

/**
 * Authenticate request via JWT cookie/Bearer and build full ALS context.
 * @param {Request} request
 */
export async function resolveAuthFromRequest(request) {
  const token = extractAccessToken(request);
  if (!token) throw AppError.unauthorized('Authentication required');

  const payload = await verifyAccessToken(token);
  if (!payload?.sub || !payload?.tenantId || !payload?.schemaName) {
    throw AppError.unauthorized('Invalid access token');
  }

  const cp = getSql();
  const tenants = await cp`
    SELECT id, schema_name, slug, status FROM tenants
    WHERE id = ${payload.tenantId} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!tenants[0] || tenants[0].status === 'suspended') {
    throw new AppError(ErrorCode.TENANT_SUSPENDED, 'Tenant is suspended', 403);
  }
  if (tenants[0].status !== 'active') {
    throw AppError.unauthorized('Tenant is not active');
  }

  const authz = await loadUserAuthz(payload.schemaName, payload.sub);
  if (!authz) throw AppError.unauthorized('User not found');

  return {
    tenantId: tenants[0].id,
    schemaName: tenants[0].schema_name,
    slug: tenants[0].slug,
    userId: authz.user.id,
    email: authz.user.email,
    name: authz.user.name,
    sessionId: payload.sid,
    roles: authz.roles,
    permissions: authz.permissions,
    projectIds: authz.projectIds,
    locationIds: authz.locationIds,
  };
}

/**
 * Legacy header-based resolve (tests / internal). Prefer JWT.
 */
export async function resolveTenantFromRequest(request) {
  // Prefer JWT when present
  const token = extractAccessToken(request);
  if (token) return resolveAuthFromRequest(request);

  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    throw new AppError(
      ErrorCode.TENANT_CONTEXT_REQUIRED,
      'Authentication required',
      401,
    );
  }

  const sql = getSql();
  const rows = await sql`
    SELECT id, schema_name, slug, status FROM tenants
    WHERE id = ${tenantId} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) throw new AppError(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found', 404);
  const tenant = rows[0];
  if (tenant.status !== 'active') {
    throw new AppError(ErrorCode.TENANT_PROVISIONING_FAILED, `Tenant is not active`, 409);
  }

  const userId = request.headers.get('x-user-id') || undefined;
  let authz = null;
  if (userId) {
    authz = await loadUserAuthz(tenant.schema_name, userId);
  }

  return {
    tenantId: tenant.id,
    schemaName: tenant.schema_name,
    slug: tenant.slug,
    userId: authz?.user?.id,
    email: authz?.user?.email,
    name: authz?.user?.name,
    roles: authz?.roles || [],
    permissions: authz?.permissions || [],
    projectIds: authz?.projectIds || [],
    locationIds: authz?.locationIds || [],
  };
}

/**
 * Resolve platform (super-admin) auth via JWT cookie/Bearer or x-platform-api-key.
 * @param {Request} request
 */
export async function resolvePlatformAuth(request) {
  const key = request.headers.get('x-platform-api-key');
  const expected = process.env.PLATFORM_API_KEY;
  if (expected && key === expected) {
    return {
      isPlatform: true,
      authMethod: 'api_key',
      platformUser: {
        id: null,
        email: 'platform-api-key',
        name: 'Platform API Key',
        role: 'super_admin',
      },
    };
  }

  const token = extractAccessToken(request);
  if (!token) throw AppError.unauthorized('Platform authentication required');

  const payload = await verifyAccessToken(token);
  if (!payload?.sub || payload.scope !== 'platform') {
    throw AppError.unauthorized('Platform authentication required');
  }

  const user = await loadPlatformUser(payload.sub);
  if (!user) throw AppError.unauthorized('Platform user not found');

  return {
    isPlatform: true,
    authMethod: 'jwt',
    platformUser: user,
    userId: user.id,
    email: user.email,
    name: user.name,
    roles: [user.role],
  };
}

export function requirePlatformUser() {
  const store = getStore();
  if (!store?.isPlatform || !store.platformUser) {
    throw AppError.unauthorized('Platform authentication required');
  }
  return store.platformUser;
}

/**
 * @param {{
 *   platform?: boolean,
 *   auth?: boolean,
 *   platformAuth?: boolean,
 *   permission?: string,
 *   audit?: { action: string, entityType: string, entityId?: (req, ctx, result) => string, getBefore?: Function, getAfter?: Function }
 * }} [options]
 * @param {Function} handler
 */
export function withApiHandler(options, handler) {
  if (typeof options === 'function') {
    handler = options;
    options = {};
  }
  const {
    platform = false,
    auth = !platform,
    platformAuth = false,
    permission = null,
    audit = null,
  } = options;

  return async (request, routeContext) => {
    const incomingId = request.headers.get('x-request-id');
    const requestId = incomingId && incomingId.length > 0 ? incomingId : crypto.randomUUID();
    const baseCtx = { requestId, isPlatform: platform };

    try {
      if (platform) {
        if (platformAuth) {
          const platformCtx = await resolvePlatformAuth(request);
          return await runWithContext({ ...baseCtx, ...platformCtx }, () =>
            handler(request, routeContext),
          );
        }
        return await runWithContext(baseCtx, () => handler(request, routeContext));
      }

      const tenantCtx = auth
        ? await resolveAuthFromRequest(request)
        : await resolveTenantFromRequest(request);

      const fullCtx = { ...baseCtx, ...tenantCtx };

      return await runWithContext(fullCtx, async () => {
        if (permission) {
          enforcePermission(fullCtx, permission);
        }
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
          enforceNotAuditorWrite(fullCtx, request.method);
        }

        let before = null;
        if (audit?.getBefore) {
          before = await audit.getBefore(request, routeContext, fullCtx);
        }

        const response = await handler(request, routeContext);

        if (audit && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
          try {
            let after = null;
            if (audit.getAfter) after = await audit.getAfter(request, routeContext, fullCtx, response);
            const entityId =
              typeof audit.entityId === 'function'
                ? await audit.entityId(request, routeContext, fullCtx, response)
                : audit.entityId || fullCtx.userId;
            await writeAuditLog({
              action: audit.action,
              entityType: audit.entityType,
              entityId,
              before,
              after,
              actorId: fullCtx.userId,
            });
          } catch (err) {
            log.warn('Audit write failed', { err: err.message, requestId });
          }
        }

        return response;
      });
    } catch (error) {
      log.error('API handler error', {
        requestId,
        err: error?.message,
        code: error?.code,
      });
      return errorResponse(error);
    }
  };
}

export { log };
