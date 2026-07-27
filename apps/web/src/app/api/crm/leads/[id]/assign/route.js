import { getTenantContext, apiSuccess, apiError, parseBody } from '@/lib/api-utils';
import { enqueueNotification } from '@/lib/queues';

/**
 * POST /api/crm/leads/[id]/assign — Assign a lead to a user
 */
export async function POST(request, { params }) {
  const ctx = getTenantContext();
  const { id } = await params;
  const body = await parseBody(request);

  const { assignedTo } = body;

  if (!assignedTo) {
    return apiError('assignedTo is required', 400, 'VALIDATION_ERROR');
  }

  // TODO: Check permission crm.lead.assign
  // TODO: Update lead assignment in tenant schema
  // TODO: Write audit log

  // Notify the assigned user
  await enqueueNotification({
    channel: 'email',
    to: assignedTo,
    template: 'lead-assigned',
    data: { leadId: id },
  });

  return apiSuccess({
    id,
    assignedTo,
    assignedAt: new Date().toISOString(),
  });
}
