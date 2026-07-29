import { successResponse, parseBody, withApiHandler } from '@/lib/api-utils';
import { loginPlatformUser } from '@/modules/platform/platform-auth-service.js';
import { attachAuthCookies } from '@/modules/auth/cookie.js';
import { checkRateLimit, resetRateLimit } from '@/modules/auth/rate-limit.js';
import { AppError, ErrorCode } from '@hippo/shared';

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: false },
  async (request) => {
    const body = await parseBody(request);
    const { email, password } = body;
    if (!email || !password) {
      throw AppError.validation('email and password are required');
    }

    const ip = request.headers.get('x-forwarded-for') || 'local';
    const rateKey = `platform-login:${ip}:${String(email).toLowerCase()}`;
    const rate = checkRateLimit(rateKey, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rate.allowed) {
      throw new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Too many login attempts', 429, {
        retryAfterSec: rate.retryAfterSec,
      });
    }

    const result = await loginPlatformUser({ email, password });
    resetRateLimit(rateKey);

    const response = successResponse({ user: result.user });
    return attachAuthCookies(response, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  },
);
