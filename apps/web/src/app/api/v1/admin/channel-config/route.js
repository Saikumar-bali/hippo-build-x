import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';
import {
  encryptChannelConfig,
  decryptChannelConfig,
  maskChannelConfig,
} from '@/modules/admin/channel-crypto.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.TENANT_MANAGE },
  async () => {
    const ctx = requireAuthContext();
    const sql = tenantSql();
    const rows = await sql.unsafe(
      `SELECT channel_config_encrypted FROM tenant_settings
       WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [ctx.tenantId],
    );
    const config = decryptChannelConfig(rows[0]?.channel_config_encrypted);
    return successResponse(maskChannelConfig(config));
  },
);

export const PATCH = withApiHandler(
  {
    auth: true,
    permission: Permission.TENANT_MANAGE,
    audit: { action: 'update', entityType: 'channel_config' },
  },
  async (request) => {
    const ctx = requireAuthContext();
    const body = await parseBody(request);
    const sql = tenantSql();
    const rows = await sql.unsafe(
      `SELECT id, channel_config_encrypted FROM tenant_settings
       WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [ctx.tenantId],
    );
    const current = decryptChannelConfig(rows[0]?.channel_config_encrypted);
    const next = { ...current, ...body };
    // Keep previous secrets if client sent masked placeholders
    for (const [k, v] of Object.entries(next)) {
      if (v === '••••••••') next[k] = current[k];
    }
    const encrypted = encryptChannelConfig(next);

    if (rows[0]) {
      await sql.unsafe(
        `UPDATE tenant_settings
         SET channel_config_encrypted = $1, updated_at = NOW(), updated_by = $2
         WHERE id = $3`,
        [encrypted, ctx.userId, rows[0].id],
      );
    } else {
      await sql.unsafe(
        `INSERT INTO tenant_settings (tenant_id, channel_config_encrypted, created_by)
         VALUES ($1, $2, $3)`,
        [ctx.tenantId, encrypted, ctx.userId],
      );
    }

    return successResponse(maskChannelConfig(next));
  },
);
