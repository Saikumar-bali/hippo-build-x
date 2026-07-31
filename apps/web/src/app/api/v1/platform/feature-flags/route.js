import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { AppError } from '@hippo/shared';
import {
  normalizeFeatureFlagInput,
  requireSuperAdmin,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async () => {
    const sql = controlPlaneSql();
    const rows = await sql`
      SELECT ff.id, ff.tenant_id, ff.flag_key, ff.forced_value, ff.reason,
             ff.created_at, ff.updated_at, t.name AS tenant_name, t.slug AS tenant_slug
      FROM feature_flags ff
      LEFT JOIN tenants t ON t.id = ff.tenant_id
      WHERE t.id IS NULL OR t.deleted_at IS NULL
      ORDER BY ff.flag_key, t.name NULLS FIRST
    `;
    return successResponse(rows);
  },
);

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const input = normalizeFeatureFlagInput(await parseBody(request));
    const sql = controlPlaneSql();

    const result = await sql.begin(async (tx) => {
      if (input.tenantId) {
        const tenant = await tx`
          SELECT id FROM tenants WHERE id = ${input.tenantId} AND deleted_at IS NULL
        `;
        if (!tenant[0]) throw AppError.notFound('Company', input.tenantId);
      }

      const rows = input.tenantId
        ? await tx`
            SELECT * FROM feature_flags
            WHERE tenant_id = ${input.tenantId} AND flag_key = ${input.flagKey}
            LIMIT 1 FOR UPDATE
          `
        : await tx`
            SELECT * FROM feature_flags
            WHERE tenant_id IS NULL AND flag_key = ${input.flagKey}
            LIMIT 1 FOR UPDATE
          `;
      const before = rows[0] || null;

      if (input.forcedValue === null) {
        if (before) await tx`DELETE FROM feature_flags WHERE id = ${before.id}`;
        await writePlatformAudit({
          actor,
          action: 'feature_control.cleared',
          entityType: 'feature_flag',
          entityId: before?.id || input.flagKey,
          tenantId: input.tenantId,
          before,
          after: null,
          metadata: { flagKey: input.flagKey },
          sql: tx,
        });
        return { removed: Boolean(before), flagKey: input.flagKey, tenantId: input.tenantId };
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
            VALUES (${input.tenantId}, ${input.flagKey}, ${input.forcedValue}, ${input.reason})
            RETURNING *
          `;

      await writePlatformAudit({
        actor,
        action: before ? 'feature_control.updated' : 'feature_control.created',
        entityType: 'feature_flag',
        entityId: after.id,
        tenantId: input.tenantId,
        before,
        after,
        sql: tx,
      });
      return after;
    });

    return successResponse(result, {}, result.id ? 200 : 200);
  },
);

export const DELETE = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw AppError.validation('Feature control id is required');
    const sql = controlPlaneSql();
    const [before] = await sql`DELETE FROM feature_flags WHERE id = ${id} RETURNING *`;
    if (!before) throw AppError.notFound('Feature control', id);
    await writePlatformAudit({
      actor,
      action: 'feature_control.deleted',
      entityType: 'feature_flag',
      entityId: id,
      tenantId: before.tenant_id,
      before,
    });
    return successResponse({ id, deleted: true });
  },
);