import { queryOne } from './db.js';

export function successResponse(data, meta) {
  return Response.json({
    success: true,
    data,
    meta: {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}

export function errorResponse(message, status = 500, code = 'INTERNAL_ERROR') {
  return Response.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export async function getTenantContext(request) {
  const tenantId = request.headers.get('x-tenant-id') || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const userId = request.headers.get('x-user-id') || 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  return { tenantId, userId };
}
