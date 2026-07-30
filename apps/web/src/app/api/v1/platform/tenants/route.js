import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { toTenantSchemaName, TENANT_STATUS, ISOLATION_MODE } from '@hippo/db';
import { enqueueTenantProvision } from '@/lib/queues';
import { AppError, ErrorCode } from '@hippo/shared';

function validateSlug(slug) {
  return (
    typeof slug === 'string' &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    slug.length <= 80
  );
}

const SELECT_TENANTS = `
  SELECT
    t.id, t.name, t.slug, t.schema_name, t.status, t.isolation_mode,
    t.database_region, t.migration_version, t.data_location_status,
    t.created_at, t.updated_at,
    job.id AS provisioning_job_id,
    job.status AS provisioning_job_status,
    job.current_step AS provisioning_current_step,
    job.attempt_count AS provisioning_attempt_count,
    job.error_code AS provisioning_error_code,
    job.error_message AS provisioning_error_message,
    job.started_at AS provisioning_started_at,
    job.finished_at AS provisioning_finished_at
  FROM tenants t
  LEFT JOIN LATERAL (
    SELECT * FROM provisioning_jobs pj
    WHERE pj.tenant_id = t.id
    ORDER BY pj.created_at DESC
    LIMIT 1
  ) job ON true
`;

function idempotentTenantQuery() {
  return `${SELECT_TENANTS}
    JOIN provisioning_jobs same_job ON same_job.tenant_id = t.id
    WHERE same_job.idempotency_key = $1 AND t.deleted_at IS NULL
    LIMIT 1`;
}

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async () => {
    const sql = controlPlaneSql();
    const tenants = await sql.unsafe(
      `${SELECT_TENANTS}
       WHERE t.deleted_at IS NULL
       ORDER BY t.created_at DESC`,
    );
    return successResponse(tenants);
  },
);

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request) => {
    const platformUser = requirePlatformUser();
    const body = await parseBody(request);
    const { name, slug, adminEmail, adminName } = body;
    const isolationMode = body.isolationMode || ISOLATION_MODE.SHARED_SCHEMA;

    if (!name || !slug || !adminEmail) {
      throw AppError.validation('Name, slug and admin email are required');
    }
    if (!validateSlug(slug)) {
      throw AppError.validation(
        'Slug must be lowercase alphanumeric with optional hyphens (e.g. green-valley)',
      );
    }
    if (!/^\S+@\S+\.\S+$/.test(adminEmail)) {
      throw AppError.validation('A valid admin email is required');
    }
    if (isolationMode !== ISOLATION_MODE.SHARED_SCHEMA) {
      throw AppError.validation('Dedicated database provisioning is reserved for P2');
    }

    const sql = controlPlaneSql();
    const idempotencyKey =
      request.headers.get('idempotency-key') || `tenant-create:${slug.toLowerCase()}`;

    const previous = await sql.unsafe(idempotentTenantQuery(), [idempotencyKey]);
    if (previous[0]) return successResponse(previous[0], { idempotentReplay: true }, 200);

    const tenantId = crypto.randomUUID();
    const schemaName = toTenantSchemaName(tenantId);

    const created = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`;

      const replay = await tx.unsafe(idempotentTenantQuery(), [idempotencyKey]);
      if (replay[0]) return { replay: replay[0] };

      const existing = await tx`
        SELECT id FROM tenants WHERE slug = ${slug} AND deleted_at IS NULL LIMIT 1
      `;
      if (existing[0]) {
        throw new AppError(ErrorCode.ALREADY_EXISTS, `Tenant slug already exists: ${slug}`, 409);
      }

      const [tenant] = await tx`
        INSERT INTO tenants
          (id, name, slug, schema_name, status, isolation_mode, data_location_status)
        VALUES
          (${tenantId}, ${name}, ${slug}, ${schemaName}, ${TENANT_STATUS.PROVISIONING},
           ${isolationMode}, 'provisioning')
        RETURNING id, name, slug, schema_name, status, isolation_mode, created_at, updated_at
      `;

      const [job] = await tx`
        INSERT INTO provisioning_jobs
          (tenant_id, idempotency_key, status, current_step, requested_by, payload)
        VALUES
          (${tenantId}, ${idempotencyKey}, 'queued', 'registered', ${platformUser.id},
           ${JSON.stringify({ adminEmail, adminName: adminName || 'Tenant Administrator' })}::jsonb)
        RETURNING id, status, current_step, attempt_count
      `;
      return { tenant, job };
    });

    if (created.replay) {
      return successResponse(created.replay, { idempotentReplay: true }, 200);
    }

    const queued = await enqueueTenantProvision({
      tenantId,
      schemaName,
      slug,
      adminEmail,
      adminName,
      provisioningJobId: created.job.id,
    });

    const [fresh] = await sql.unsafe(
      `${SELECT_TENANTS} WHERE t.id = $1 LIMIT 1`,
      [tenantId],
    );
    return successResponse({ ...fresh, provisionMode: queued.mode }, {}, 201);
  },
);
