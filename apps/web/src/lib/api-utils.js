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
import { createControlPlaneSql, createTenantSql } from '@hippo/db';
import { verifyAccessToken } from './auth.js';
import { extractAccessToken } from '@/modules/auth/cookie.js';
import { loadUserAuthz } from '@/modules/auth/session-service.js';
import { loadPlatformUser } from '@/modules/platform/platform-auth-service.js';
import { enforceNotAuditorWrite, enforcePermission } from '@hippo/rbac';
import { writeAuditLog } from '@/modules/audit/audit-service.js';

const log = createLogger({ service: 'web-api' });

export function successResponse(data, meta = {}, status = 200) {
  return Response.json(sharedSuccess(data, meta, getRequestId()), { status });
}

export function errorResponse(errorOrMessage, status = 500, code = ErrorCode.INTERNAL_ERROR) {
  if (errorOrMessage instanceof AppError) {
    const body = sharedError(
      [
        {
          code: errorOrMessage.code,
          message: errorOrMessage.message,
          details: errorOrMessage.details,
        },
      ],
      {},
      getRequestId(),
    );
    return Response.json(body, { status: errorOrMessage.statusCode });
  }

  const message =
    typeof errorOrMessage === 'string'
      ? errorOrMessage
      : errorOrMessage?.message || 'Internal error';
  return Response.json(sharedError([{ code, message }], {}, getRequestId()), { status });
}

export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw AppError.validation('Invalid JSON body');
  }
}

export function controlPlaneSql() {
  return createControlPlaneSql();
}

export function tenantSql() {
  const { schemaName, tenantId } = requireTenantContext();
  return createTenantSql(schemaName, tenantId);
}

async function resolveTenantRecord(tenantId) {
  const cp = createControlPlaneSql();
  const rows = await cp`
    SELECT id, schema_name, slug, status, isolation_mode, database_secret_ref
    FROM tenants
    WHERE id = ${tenantId} AND deleted_at IS NULL
    LIMIT 1
  `;
  return rows[0] || null;
}

/**
 * Authenticate a tenant request. Tokens carry identity only; schema/database
 * locators are always reloaded from control_plane.tenants.
 */
export async function resolveAuthFromRequest(request) {
  const token = extractAccessToken(request);
  if (!token) throw AppError.unauthorized('Authentication required');

  const payload = await verifyAccessToken(token);
  if (!payload?.sub || !payload?.tenantId || payload.scope === 'platform') {
    throw AppError.unauthorized('Invalid access token');
  }

  const tenant = await resolveTenantRecord(payload.tenantId);
  if (!tenant || tenant.status === 'suspended') {
    throw new AppError(ErrorCode.TENANT_SUSPENDED, 'Tenant is suspended', 403);
  }
  if (tenant.status !== 'active') throw AppError.unauthorized('Tenant is not active');
  if (tenant.isolation_mode === 'dedicated_database' && !tenant.database_secret_ref) {
    throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Tenant data source is not ready', 503);
  }

  const authz = await loadUserAuthz(tenant.schema_name, payload.sub, tenant.id);
  if (!authz) throw AppError.unauthorized('User not found');

  return {
    tenantId: tenant.id,
    schemaName: tenant.schema_name,
    isolationMode: tenant.isolation_mode,
    slug: tenant.slug,
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
 * Header-based tenant resolution remains only for unauthenticated internal/E2E
 * routes. An authenticated JWT always wins and the header cannot override it.
 */
export async function resolveTenantFromRequest(request) {
  const token = extractAccessToken(request);
  if (token) return resolveAuthFromRequest(request);

  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    throw new AppError(ErrorCode.TENANT_CONTEXT_REQUIRED, 'Authentication required', 401);
  }

  const tenant = await resolveTenantRecord(tenantId);
  if (!tenant) throw new AppError(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found', 404);
  if (tenant.status !== 'active') {
    throw new AppError(ErrorCode.TENANT_PROVISIONING_FAILED, 'Tenant is not active', 409);
  }

  const userId = request.headers.get('x-user-id') || undefined;
  const authz = userId ? await loadUserAuthz(tenant.schema_name, userId, tenant.id) : null;

  return {
    tenantId: tenant.id,
    schemaName: tenant.schema_name,
    isolationMode: tenant.isolation_mode,
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
    const requestId = incomingId?.length ? incomingId : crypto.randomUUID();
    const baseCtx = { requestId, isPlatform: platform };

    try {
      if (platform) {
        if (platformAuth) {
          const platformCtx = await resolvePlatformAuth(request);
          return runWithContext({ ...baseCtx, ...platformCtx }, () =>
            handler(request, routeContext),
          );
        }
        return runWithContext(baseCtx, () => handler(request, routeContext));
      }

      const tenantCtx = auth
        ? await resolveAuthFromRequest(request)
        : await resolveTenantFromRequest(request);
      const fullCtx = { ...baseCtx, ...tenantCtx };

      return runWithContext(fullCtx, async () => {
        if (permission) enforcePermission(fullCtx, permission);
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
          enforceNotAuditorWrite(fullCtx, request.method);
        }

        const before = audit?.getBefore
          ? await audit.getBefore(request, routeContext, fullCtx)
          : null;
        const response = await handler(request, routeContext);

        if (audit && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
          try {
            const after = audit.getAfter
              ? await audit.getAfter(request, routeContext, fullCtx, response)
              : null;
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
          } catch (error) {
            log.warn('Audit write failed', { err: error.message, requestId });
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
