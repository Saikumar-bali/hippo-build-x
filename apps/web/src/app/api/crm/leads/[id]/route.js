import { getTenantContext, apiSuccess, apiError } from '@/lib/api-utils';

/**
 * GET /api/crm/leads/[id] — Get a single lead
 */
export async function GET(_request, { params }) {
  const ctx = getTenantContext();
  const { id } = await params;

  // TODO: Query tenant schema for lead by ID
  // TODO: Check permission crm.lead.read
  // TODO: Verify lead belongs to tenant

  return apiSuccess({
    id,
    name: 'Demo Lead',
    email: 'lead@example.com',
    status: 'new',
  });
}

/**
 * PATCH /api/crm/leads/[id] — Update a lead
 */
export async function PATCH(request, { params }) {
  const ctx = getTenantContext();
  const { id } = await params;
  const body = await request.json();

  // TODO: Check permission crm.lead.update
  // TODO: Update in tenant schema
  // TODO: Emit lead.updated event
  // TODO: Write audit log with before/after

  return apiSuccess({ id, ...body, updatedAt: new Date().toISOString() });
}

/**
 * DELETE /api/crm/leads/[id] — Soft delete a lead
 */
export async function DELETE(_request, { params }) {
  const ctx = getTenantContext();
  const { id } = await params;

  // TODO: Check permission crm.lead.delete
  // TODO: Soft delete in tenant schema
  // TODO: Write audit log

  return apiSuccess({ id, deleted: true });
}
