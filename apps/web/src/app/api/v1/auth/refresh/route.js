import { successResponse, withApiHandler } from '@/lib/api-utils';
import { rotateRefreshToken } from '@/modules/auth/session-service.js';
import { attachAuthCookies, extractRefreshToken } from '@/modules/auth/cookie.js';
import { AppError } from '@hippo/shared';

export const POST = withApiHandler({ platform: true, auth: false }, async (request) => {
  const refresh = extractRefreshToken(request);
  if (!refresh) throw AppError.unauthorized('Refresh token required');

  const result = await rotateRefreshToken(refresh, {
    userAgent: request.headers.get('user-agent') || undefined,
    ip: request.headers.get('x-forwarded-for') || undefined,
  });

  const response = successResponse({
    user: result.user,
    roles: result.roles,
    permissions: result.permissions,
    tenant: result.tenant,
  });

  return attachAuthCookies(response, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
});
