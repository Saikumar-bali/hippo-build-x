/**
 * Standard API response envelope used across all endpoints.
 */
export function successResponse(data, meta) {
  return {
    success: true,
    data,
    meta: {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export function errorResponse(errors, meta) {
  return {
    success: false,
    data: null,
    errors,
    meta: {
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}
