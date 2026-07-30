import { successResponse, withApiHandler } from '@/lib/api-utils';
import { revokeSession } from '@/modules/auth/session-service.js';
import { clearAuthCookies } from '@/modules/auth/cookie.js';
import { getRequestContext } from '@/lib/tenant-context.js';

export const POST = withApiHandler({ auth: true }, async () => {
  const ctx = getRequestContext();
  if (ctx.sessionId && ctx.schemaName && ctx.tenantId) {
    await revokeSession(ctx.schemaName, ctx.tenantId, ctx.sessionId);
  }
  return clearAuthCookies(successResponse({ ok: true }));
});
