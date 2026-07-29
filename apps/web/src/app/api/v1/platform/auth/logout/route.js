import { successResponse, withApiHandler } from '@/lib/api-utils';
import { clearAuthCookies } from '@/modules/auth/cookie.js';

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: false },
  async () => {
    const response = successResponse({ ok: true });
    return clearAuthCookies(response);
  },
);
