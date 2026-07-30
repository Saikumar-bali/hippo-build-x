import { successResponse, parseBody, withApiHandler, controlPlaneSql } from '@/lib/api-utils';
import { resetPasswordWithToken } from '@/modules/auth/session-service.js';
import { AppError } from '@hippo/shared';

export const POST = withApiHandler({ platform: true, auth: false }, async (request) => {
  const { slug, token, password } = await parseBody(request);
  if (!slug || !token || !password) {
    throw AppError.validation('slug, token, and password are required');
  }
  if (String(password).length < 8) {
    throw AppError.validation('Password must be at least 8 characters');
  }

  const cp = controlPlaneSql();
  const tenants = await cp`
    SELECT id, schema_name FROM tenants
    WHERE slug = ${slug} AND deleted_at IS NULL AND status = 'active'
    LIMIT 1
  `;
  if (!tenants[0]) throw AppError.validation('Invalid or expired reset token');

  await resetPasswordWithToken(tenants[0].schema_name, tenants[0].id, token, password);
  return successResponse({ ok: true });
});
