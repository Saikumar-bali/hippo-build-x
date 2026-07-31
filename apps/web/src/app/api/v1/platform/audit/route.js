import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request) => {
    const sql = controlPlaneSql();
    const url = new URL(request.url);
    const page = positiveInteger(url.searchParams.get('page'), 1);
    const pageSize = Math.min(
      positiveInteger(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const offset = (page - 1) * pageSize;
    const tenantId = url.searchParams.get('tenantId') || null;
    const action = url.searchParams.get('action') || null;
    const search = String(url.searchParams.get('search') || '').trim() || null;

    const filters = [];
    const values = [];
    const add = (sqlFragment, value) => {
      values.push(value);
      filters.push(sqlFragment.replace('?', `$${values.length}`));
    };
    if (tenantId) add('audit.tenant_id = ?', tenantId);
    if (action) add('audit.action = ?', action);
    if (search) {
      values.push(`%${search}%`);
      filters.push(`(
        audit.action ILIKE $${values.length}
        OR audit.entity_type ILIKE $${values.length}
        OR COALESCE(audit.entity_id, '') ILIKE $${values.length}
        OR COALESCE(audit.actor_email, '') ILIKE $${values.length}
        OR COALESCE(tenant.name, '') ILIKE $${values.length}
      )`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [countRow] = await sql.unsafe(
      `SELECT COUNT(*)::int AS total
       FROM platform_audit_logs audit
       LEFT JOIN tenants tenant ON tenant.id = audit.tenant_id
       ${where}`,
      values,
    );
    const rows = await sql.unsafe(
      `SELECT audit.id, audit.actor_id, audit.actor_email, audit.action,
              audit.entity_type, audit.entity_id, audit.tenant_id,
              audit.before_state, audit.after_state, audit.metadata,
              audit.request_id, audit.created_at,
              tenant.name AS tenant_name, tenant.slug AS tenant_slug
       FROM platform_audit_logs audit
       LEFT JOIN tenants tenant ON tenant.id = audit.tenant_id
       ${where}
       ORDER BY audit.created_at DESC, audit.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    const actions = await sql`
      SELECT DISTINCT action FROM platform_audit_logs ORDER BY action
    `;

    return successResponse({
      rows,
      actions: actions.map((item) => item.action),
      page: {
        page,
        pageSize,
        total: countRow.total,
        totalPages: Math.max(1, Math.ceil(countRow.total / pageSize)),
      },
    });
  },
);