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

export const PATCH = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const body = await parseBody(request);
    const nextStatus = body.status;
    const reason = String(body.reason || '').trim();
    if (!['active', 'suspended'].includes(nextStatus)) {
      throw AppError.validation('Status must be active or suspended');
    }
    if (nextStatus === 'suspended' && reason.length < 5) {
      throw AppError.validation('A suspension reason of at least 5 characters is required');
    }

    const sql = controlPlaneSql();
    const before = await getPlatformTenant(id, { sql });
    if (before.status === nextStatus) {
      return successResponse({ ...before, revokedSessions: 0 }, { idempotentReplay: true });
    }

    if (nextStatus === 'active') {
      const [schema] = await sql.unsafe(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
         ) AS exists`,
        [before.schema_name],
      );
      if (!schema?.exists || !before.migration_version) {
        throw AppError.conflict('Company data is not ready to resume');
      }
      if (before.data_location_status === 'purged') {
        throw AppError.conflict('A purged company cannot be resumed');
      }
    }

    const [after] = await sql`
      UPDATE tenants
      SET status = ${nextStatus},
          data_location_status = ${nextStatus === 'active' ? 'ready' : 'suspended'},
          updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, name, slug, schema_name, status, isolation_mode,
                migration_version, data_location_status, created_at, updated_at
    `;

    let revokedSessions = 0;
    if (nextStatus === 'suspended') revokedSessions = await revokeTenantSessions(before);

    await writePlatformAudit({
      actor,
      action: nextStatus === 'active' ? 'tenant.resumed' : 'tenant.suspended',
      entityType: 'tenant',
      entityId: id,
      tenantId: id,
      before,
      after,
      metadata: { reason: reason || null, revokedSessions },
    });

    return successResponse({ ...after, revokedSessions });
  },
);