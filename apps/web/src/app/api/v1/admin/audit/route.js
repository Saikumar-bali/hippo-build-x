import { successResponse, withApiHandler, tenantSql } from '@/lib/api-utils';
import { Permission } from '@hippo/rbac';

export const GET = withApiHandler(
  { auth: true, permission: Permission.AUDIT_READ },
  async (request) => {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const action = searchParams.get('action');
    const actorId = searchParams.get('actorId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    let text = `
      SELECT id, action, entity_type, entity_id, actor_id, before, after,
             correlation_id, created_at
      FROM audit_log
      WHERE deleted_at IS NULL
    `;
    const params = [];
    let idx = 1;
    if (entityType) {
      text += ` AND entity_type = $${idx++}`;
      params.push(entityType);
    }
    if (action) {
      text += ` AND action = $${idx++}`;
      params.push(action);
    }
    if (actorId) {
      text += ` AND actor_id = $${idx++}`;
      params.push(actorId);
    }
    if (from) {
      text += ` AND created_at >= $${idx++}`;
      params.push(from);
    }
    if (to) {
      text += ` AND created_at <= $${idx++}`;
      params.push(to);
    }
    text += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const sql = tenantSql();
    const rows = await sql.unsafe(text, params);
    return successResponse(rows);
  },
);
