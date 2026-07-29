/**
 * Standard API response envelope used across all endpoints.
 */

/**
 * @param {unknown} data
 * @param {object} [meta]
 * @param {string} [requestId]
 */
export function successResponse(data, meta = {}, requestId) {
  return {
    success: true,
    data,
    errors: null,
    meta: {
      requestId: requestId || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * @param {Array<{ code: string, message: string, details?: unknown }>|string} errors
 * @param {object} [meta]
 * @param {string} [requestId]
 */
export function errorResponse(errors, meta = {}, requestId) {
  const normalized = Array.isArray(errors)
    ? errors
    : [{ code: 'INTERNAL_ERROR', message: String(errors) }];

  return {
    success: false,
    data: null,
    errors: normalized,
    meta: {
      requestId: requestId || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}
