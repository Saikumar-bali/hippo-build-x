import { successResponse, parseBody, withApiHandler } from '@/lib/api-utils';
import { createPasswordResetToken } from '@/modules/auth/session-service.js';
import { getSql } from '@hippo/db';
import { AppError } from '@hippo/shared';

export const POST = withApiHandler({ platform: true, auth: false }, async (request) => {
  const body = await parseBody(request);
  const { slug, email } = body;
  if (!slug || !email) throw AppError.validation('slug and email are required');

  const cp = getSql();
  const tenants = await cp`
    SELECT id, schema_name FROM tenants
    WHERE slug = ${slug} AND deleted_at IS NULL AND status = 'active'
    LIMIT 1
  `;

  // Always return success to avoid enumeration
  if (tenants[0]) {
    const result = await createPasswordResetToken(tenants[0].schema_name, tenants[0].id, email);
    // In production, enqueue email. For Phase 1 tests, expose token only in non-production.
    if (result && process.env.NODE_ENV !== 'production') {
      return successResponse({
        ok: true,
        message: 'If the account exists, a reset link was sent',
        devToken: result.token,
        schemaName: tenants[0].schema_name,
      });
    }
  }

  return successResponse({ ok: true, message: 'If the account exists, a reset link was sent' });
});
