/**
 * Standard error codes used across the application.
 */

export const ErrorCode = Object.freeze({
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_REVOKED: 'SESSION_REVOKED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Tenant
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_SUSPENDED: 'TENANT_SUSPENDED',
  CROSS_TENANT_ACCESS: 'CROSS_TENANT_ACCESS',
  TENANT_CONTEXT_REQUIRED: 'TENANT_CONTEXT_REQUIRED',
  TENANT_PROVISIONING_FAILED: 'TENANT_PROVISIONING_FAILED',

  // Business
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  NEGATIVE_STOCK_REJECTED: 'NEGATIVE_STOCK_REJECTED',

  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
});

export class AppError extends Error {
  constructor(code, message, statusCode = 500, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static notFound(resource, id) {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found: ${id}`, 404);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message = 'Insufficient permissions') {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static conflict(message) {
    return new AppError(ErrorCode.CONFLICT, message, 409);
  }

  static validation(message, details) {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }
}
