import { tenantSql } from '@/lib/api-utils';
import { getRequestContext } from '@/lib/tenant-context.js';

/**
 * Write an audit log row in the current tenant schema.
 */
export async function writeAuditLog({
  action,
  entityType,
  entityId,
  before = null,
  after = null,
  metadata = null,
  actorId = null,
}) {
  const ctx = getRequestContext();
  const sql = tenantSql();
  await sql.unsafe(
    `INSERT INTO audit_log (
      tenant_id, action, entity_type, entity_id, actor_id, actor_type,
      before, after, metadata, correlation_id, ip_address
    ) VALUES ($1,$2,$3,$4,$5,'user',$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)`,
    [
      ctx.tenantId,
      action,
      entityType,
      entityId,
      actorId || ctx.userId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      metadata ? JSON.stringify(metadata) : null,
      ctx.requestId || null,
      null,
    ],
  );
}
