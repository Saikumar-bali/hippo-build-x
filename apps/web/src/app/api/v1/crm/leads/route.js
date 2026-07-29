import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireTenantContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';

export const GET = withApiHandler(async () => {
  const { tenantId } = requireTenantContext();
  const sql = tenantSql();
  // Leads table is Phase 3 — return empty until module lands; context still required
  try {
    const leads = await sql.unsafe(
      `SELECT l.* FROM leads l
       WHERE l.tenant_id = $1 AND l.deleted_at IS NULL
       ORDER BY l.created_at DESC`,
      [tenantId],
    );
    return successResponse(leads);
  } catch (error) {
    if (String(error.message).includes('does not exist')) {
      return successResponse([]);
    }
    throw error;
  }
});

export const POST = withApiHandler(async (request) => {
  const { tenantId, userId } = requireTenantContext();
  const body = await parseBody(request);
  const { name, email, phone, source, notes } = body;

  if (!name) throw AppError.validation('Name is required');

  const sql = tenantSql();
  try {
    const [lead] = await sql.unsafe(
      `INSERT INTO leads (tenant_id, name, email, phone, source, notes, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *`,
      [tenantId, name, email || null, phone || null, source || 'direct', notes || null, userId || null],
    );
    return successResponse(lead, {}, 201);
  } catch (error) {
    if (String(error.message).includes('does not exist')) {
      throw AppError.validation('CRM leads module is not available in this tenant schema yet');
    }
    throw error;
  }
});
