/**
 * Server-side utilities for API routes.
 * These run on the server only — never bundled into client code.
 */

import { headers } from 'next/headers';

/**
 * Get the tenant context from the request headers.
 * Set by middleware or extracted from JWT.
 */
export function getTenantContext() {
  const headersList = headers();

  return {
    tenantId: headersList.get('x-tenant-id') || 'dev-tenant',
    schemaName: headersList.get('x-tenant-schema') || 'tenant_dev',
    userId: headersList.get('x-user-id') || 'dev-user',
    roles: (headersList.get('x-user-roles') || 'admin').split(','),
    permissions: (headersList.get('x-user-permissions') || '*').split(','),
  };
}

/**
 * Create a standardized API error response.
 */
export function apiError(message, status = 500, code = 'INTERNAL_ERROR') {
  return Response.json(
    {
      success: false,
      error: { code, message },
    },
    { status },
  );
}

/**
 * Create a standardized API success response.
 */
export function apiSuccess(data, meta) {
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

/**
 * Extract and validate the request body.
 */
export async function parseBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
}
