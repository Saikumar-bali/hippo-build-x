import { successResponse, parseBody, withApiHandler } from '@/lib/api-utils';
import { resetPasswordWithToken } from '@/modules/auth/session-service.js';
import { getSql } from '@hippo/db';
import { AppError } from '@hippo/shared';

export const POST = withApiHandler({ platform: true, auth: false }, async (request) => {
  const body = await parseBody(request);
  const { slug, token, password } = body;
  if (!slug || !token || !password) {
    throw AppError.validation('slug, token, and password are required');
  }
  if (String(password).length < 8) {
    throw AppError.validation('Password must be at least 8 characters');
  }

  const cp = getSql();
  const tenants = await cp`
    SELECT schema_name FROM tenants
    WHERE slug = ${slug} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!tenants[0]) throw AppError.validation('Invalid or expired reset token');

  await resetPasswordWithToken(tenants[0].schema_name, token, password);
  return successResponse({ ok: true });
});
