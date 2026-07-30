import { successResponse, parseBody, withApiHandler, controlPlaneSql } from '@/lib/api-utils';
import { createPasswordResetToken } from '@/modules/auth/session-service.js';
import { AppError } from '@hippo/shared';

export const POST = withApiHandler({ platform: true, auth: false }, async (request) => {
  const { slug, email } = await parseBody(request);
  if (!slug || !email) throw AppError.validation('slug and email are required');

  const cp = controlPlaneSql();
  const tenants = await cp`
    SELECT id, schema_name FROM tenants
    WHERE slug = ${slug} AND deleted_at IS NULL AND status = 'active'
    LIMIT 1
  `;

  if (tenants[0]) {
    const result = await createPasswordResetToken(
      tenants[0].schema_name,
      tenants[0].id,
      email,
    );
    if (result && process.env.NODE_ENV !== 'production') {
      return successResponse({
        ok: true,
        message: 'If the account exists, a reset link was sent',
        devToken: result.token,
      });
    }
  }

  return successResponse({ ok: true, message: 'If the account exists, a reset link was sent' });
});
