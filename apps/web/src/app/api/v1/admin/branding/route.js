import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';

export const GET = withApiHandler(
  { auth: true, permission: Permission.TENANT_BRANDING },
  async () => {
    const ctx = requireAuthContext();
    const sql = tenantSql();
    const rows = await sql.unsafe(
      `SELECT branding, feature_flags FROM tenant_settings
       WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [ctx.tenantId],
    );
    return successResponse(
      rows[0] || { branding: {}, feature_flags: {} },
    );
  },
);

export const PATCH = withApiHandler(
  {
    auth: true,
    permission: Permission.TENANT_BRANDING,
    audit: { action: 'update', entityType: 'branding' },
  },
  async (request) => {
    const ctx = requireAuthContext();
    const body = await parseBody(request);
    const sql = tenantSql();
    const existing = await sql.unsafe(
      `SELECT id, branding, feature_flags FROM tenant_settings
       WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [ctx.tenantId],
    );

    const branding = { ...(existing[0]?.branding || {}), ...(body.branding || {}) };
    const featureFlags = {
      ...(existing[0]?.feature_flags || {}),
      ...(body.feature_flags || {}),
    };

    if (existing[0]) {
      await sql.unsafe(
        `UPDATE tenant_settings
         SET branding = $1::jsonb, feature_flags = $2::jsonb, updated_at = NOW(), updated_by = $3
         WHERE id = $4`,
        [JSON.stringify(branding), JSON.stringify(featureFlags), ctx.userId, existing[0].id],
      );
    } else {
      await sql.unsafe(
        `INSERT INTO tenant_settings (tenant_id, branding, feature_flags, created_by)
         VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
        [ctx.tenantId, JSON.stringify(branding), JSON.stringify(featureFlags), ctx.userId],
      );
    }

    return successResponse({ branding, feature_flags: featureFlags });
  },
);
