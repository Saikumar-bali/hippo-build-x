import { getTenantContext, apiSuccess, apiError, parseBody } from '@/lib/api-utils';

/**
 * GET /api/crm/leads — List leads with pagination
 */
export async function GET(request) {
  const ctx = getTenantContext();
  const { searchParams } = new URL(request.url);

  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  const search = searchParams.get('search') || '';

  // TODO: Query tenant schema for leads
  // const leads = await db.query.leads.findMany({ ... });

  return apiSuccess(
    [],
    {
      pagination: { page, pageSize, total: 0, totalPages: 0 },
    },
  );
}

/**
 * POST /api/crm/leads — Create a new lead
 */
export async function POST(request) {
  const ctx = getTenantContext();

  let body;
  try {
    body = await parseBody(request);
  } catch {
    return apiError('Invalid JSON body', 400, 'VALIDATION_ERROR');
  }

  const { name, email, phone, source } = body;

  if (!name) {
    return apiError('Name is required', 400, 'VALIDATION_ERROR');
  }

  // TODO: Check permission crm.lead.create
  // TODO: Insert into tenant schema
  // TODO: Emit lead.created event
  // TODO: Write audit log

  return apiSuccess({
    id: crypto.randomUUID(),
    name,
    email,
    phone,
    source,
    status: 'new',
    createdAt: new Date().toISOString(),
  });
}
