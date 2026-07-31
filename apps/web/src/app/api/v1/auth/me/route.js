import { successResponse, withApiHandler } from '@/lib/api-utils';
import { loadUserAuthz } from '@/modules/auth/session-service.js';
import { requireAuthContext } from '@/lib/tenant-context.js';

export const GET = withApiHandler({ auth: true }, async () => {
  const ctx = requireAuthContext();
  const authz = await loadUserAuthz(ctx.schemaName, ctx.userId, ctx.tenantId);
  return successResponse({
    user: authz.user,
    roles: authz.roles,
    permissions: authz.permissions,
    projectIds: authz.projectIds,
    locationIds: authz.locationIds,
    plan: ctx.plan || null,
    modules: ctx.modules || {},
    moduleDecisions: ctx.moduleDecisions || {},
    tenant: {
      id: ctx.tenantId,
      slug: ctx.slug,
      schemaName: ctx.schemaName,
    },
  });
});