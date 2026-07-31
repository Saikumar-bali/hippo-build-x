import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { AppError } from '@hippo/shared';
import {
  getPlatformTenant,
  requireSuperAdmin,
  revokeTenantSessions,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const body = await parseBody(request);
    const reason = String(body.reason || '').trim();
    if (reason.length < 5) {
      throw AppError.validation('An incident or support reason of at least 5 characters is required');
    }

    const tenant = await getPlatformTenant(id, { sql: controlPlaneSql() });
    const revokedSessions = await revokeTenantSessions(tenant);
    await writePlatformAudit({
      actor,
      action: 'tenant.sessions_revoked',
      entityType: 'tenant',
      entityId: id,
      tenantId: id,
      metadata: { reason, revokedSessions },
    });
    return successResponse({ tenantId: id, revokedSessions });
  },
);