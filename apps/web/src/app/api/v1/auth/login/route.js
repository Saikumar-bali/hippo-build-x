import { successResponse, parseBody, withApiHandler } from '@/lib/api-utils';
import { loginWithPassword } from '@/modules/auth/session-service.js';
import { attachAuthCookies } from '@/modules/auth/cookie.js';
import { checkRateLimit, resetRateLimit } from '@/modules/auth/rate-limit.js';
import { AppError, ErrorCode } from '@hippo/shared';

export const POST = withApiHandler({ platform: true, auth: false }, async (request) => {
  const body = await parseBody(request);
  const { slug, email, password } = body;
  if (!slug || !email || !password) {
    throw AppError.validation('slug, email, and password are required');
  }

  const ip = request.headers.get('x-forwarded-for') || 'local';
  const rateKey = `login:${ip}:${String(email).toLowerCase()}`;
  const rate = checkRateLimit(rateKey, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rate.allowed) {
    throw new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Too many login attempts', 429, {
      retryAfterSec: rate.retryAfterSec,
    });
  }

  const result = await loginWithPassword({
    slug,
    email,
    password,
    userAgent: request.headers.get('user-agent') || undefined,
    ip,
  });
  resetRateLimit(rateKey);

  const response = successResponse({
    user: result.user,
    roles: result.roles,
    permissions: result.permissions,
    projectIds: result.projectIds,
    locationIds: result.locationIds,
    tenant: result.tenant,
  });

  return attachAuthCookies(response, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});
