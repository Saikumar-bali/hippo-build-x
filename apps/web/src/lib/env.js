import { validateEnv, webEnvSchema } from '@hippo/shared';

let _validated = null;

/**
 * Validate and cache web environment. Call at process start / first request.
 */
export function getEnv() {
  if (!_validated) {
    // In Next.js, env may be injected at runtime; skip hard fail in build phase
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      _validated = {
        DATABASE_URL: process.env.DATABASE_URL || '',
        REDIS_URL: process.env.REDIS_URL || '',
        JWT_SECRET: process.env.JWT_SECRET || 'build-placeholder',
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'build-placeholder',
        NODE_ENV: process.env.NODE_ENV || 'production',
        CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
      };
      return _validated;
    }
    _validated = validateEnv(webEnvSchema);
  }
  return _validated;
}

/**
 * Force validation (throws if missing). Use from runtime entry points.
 */
export function assertEnv() {
  _validated = null;
  return getEnv();
}
