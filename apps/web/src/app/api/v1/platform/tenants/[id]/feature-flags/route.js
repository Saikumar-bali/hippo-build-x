import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import {
  getPlatformTenant,
  normalizeFeatureFlagInput,
  requireSuperAdmin,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

export const PATCH = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const input = normalizeFeatureFlagInput({ ...(await parseBody(request)), tenantId: id });
    const sql = controlPlaneSql();
    await getPlatformTenant(id, { sql });

    const result = await sql.begin(async (tx) => {
      const [before] = await tx`
        SELECT * FROM feature_flags
        WHERE tenant_id = ${id} AND flag_key = ${input.flagKey}
        LIMIT 1 FOR UPDATE
      `;

      if (input.forcedValue === null) {
        if (before) await tx`DELETE FROM feature_flags WHERE id = ${before.id}`;
        await writePlatformAudit({
          actor,
          action: 'feature_control.cleared',
          entityType: 'feature_flag',
          entityId: before?.id || input.flagKey,
          tenantId: id,
          before: before || null,
          metadata: { flagKey: input.flagKey },
          sql: tx,
        });
        return { removed: Boolean(before), flagKey: input.flagKey, tenantId: id };
      }

      const [after] = before
        ? await tx`
            UPDATE feature_flags
            SET forced_value = ${input.forcedValue}, reason = ${input.reason}, updated_at = NOW()
            WHERE id = ${before.id}
            RETURNING *
          `
        : await tx`
            INSERT INTO feature_flags (tenant_id, flag_key, forced_value, reason)
            VALUES (${id}, ${input.flagKey}, ${input.forcedValue}, ${input.reason})
            RETURNING *
          `;

      await writePlatformAudit({
        actor,
        action: before ? 'feature_control.updated' : 'feature_control.created',
        entityType: 'feature_flag',
        entityId: after.id,
        tenantId: id,
        before: before || null,
        after,
        sql: tx,
      });
      return after;
    });

    return successResponse(result);
  },
);