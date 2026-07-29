import {
  successResponse,
  errorResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
} from '@/lib/api-utils';
import { toSchemaName, TENANT_STATUS } from '@hippo/db';
import { enqueueTenantProvision } from '@/lib/queues';
import { AppError, ErrorCode } from '@hippo/shared';

function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}

export const GET = withApiHandler({ platform: true, auth: false, platformAuth: true }, async () => {
  const sql = controlPlaneSql();
  const tenants = await sql`
    SELECT id, name, slug, schema_name, status, created_at, updated_at
    FROM tenants
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `;
  return successResponse(tenants);
});

export const POST = withApiHandler({ platform: true, auth: false, platformAuth: true }, async (request) => {
  const body = await parseBody(request);
  const { name, slug, adminEmail, adminName } = body;

  if (!name || !slug) {
    throw AppError.validation('Name and slug are required');
  }
  if (!validateSlug(slug)) {
    throw AppError.validation(
      'Slug must be lowercase alphanumeric with optional hyphens (e.g. green-valley)',
    );
  }

  const schemaName = toSchemaName(slug);
  const sql = controlPlaneSql();

  const existing = await sql`
    SELECT id FROM tenants WHERE slug = ${slug} AND deleted_at IS NULL LIMIT 1
  `;
  if (existing.length > 0) {
    throw new AppError(ErrorCode.ALREADY_EXISTS, `Tenant slug already exists: ${slug}`, 409);
  }

  const [tenant] = await sql`
    INSERT INTO tenants (name, slug, schema_name, status)
    VALUES (${name}, ${slug}, ${schemaName}, ${TENANT_STATUS.PROVISIONING})
    RETURNING id, name, slug, schema_name, status, created_at, updated_at
  `;

  const job = await enqueueTenantProvision({
    tenantId: tenant.id,
    schemaName,
    slug,
    adminEmail,
    adminName,
  });

  const [fresh] = await sql`
    SELECT id, name, slug, schema_name, status, created_at, updated_at
    FROM tenants WHERE id = ${tenant.id}
  `;

  return successResponse(
    { ...fresh, provisionMode: job.mode },
    {},
    job.mode === 'sync' ? 201 : 201,
  );
});
