import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { AppError } from '@hippo/shared';
import {
  getPlatformTenant,
  requireSuperAdmin,
  revokeTenantSessions,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

const DEFAULT_RETENTION_DAYS = Number(process.env.TENANT_PURGE_RETENTION_DAYS || 30);

function confirmation(body, tenant) {
  const expected = `DELETE ${tenant.slug}`;
  if (String(body.confirmation || '').trim() !== expected) {
    throw AppError.validation(`Type ${expected} to confirm this operation`);
  }
}

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const body = await parseBody(request);
    const mode = body.mode;
    if (!['soft_delete', 'purge'].includes(mode)) {
      throw AppError.validation('Mode must be soft_delete or purge');
    }

    const reason = String(body.reason || '').trim();
    if (reason.length < 10) {
      throw AppError.validation('An offboarding reason of at least 10 characters is required');
    }

    const sql = controlPlaneSql();
    const tenant = await getPlatformTenant(id, { includeDeleted: true, sql });
    confirmation(body, tenant);

    if (mode === 'soft_delete') {
      if (tenant.deleted_at) {
        const [existing] = await sql`
          SELECT id, mode, status, legal_hold, requested_at, scheduled_for, completed_at
          FROM tenant_deletion_jobs
          WHERE tenant_id = ${id} AND mode = 'soft_delete'
          ORDER BY requested_at DESC LIMIT 1
        `;
        return successResponse(
          { tenantId: id, deleted: true, job: existing || null },
          { idempotentReplay: true },
        );
      }
      if (tenant.status !== 'suspended') {
        throw AppError.conflict('Suspend the company before starting offboarding');
      }

      const revokedSessions = await revokeTenantSessions(tenant);
      const result = await sql.begin(async (tx) => {
        const [job] = await tx`
          INSERT INTO tenant_deletion_jobs
            (tenant_id, mode, status, legal_hold, requested_by, approved_by,
             requested_at, started_at, completed_at, reason, evidence)
          VALUES
            (${id}, 'soft_delete', 'completed', ${Boolean(body.legalHold)},
             ${actor.id}, ${actor.id}, NOW(), NOW(), NOW(), ${reason},
             ${JSON.stringify({ revokedSessions, retainedForRecovery: true })}::jsonb)
          RETURNING id, mode, status, legal_hold, requested_at, completed_at, reason
        `;
        await tx`
          UPDATE subscriptions
          SET status = 'cancelled', ends_at = COALESCE(ends_at, NOW()),
              cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
          WHERE tenant_id = ${id} AND status IN ('active', 'trial', 'paused')
        `;
        const [after] = await tx`
          UPDATE tenants
          SET status = 'suspended', data_location_status = 'soft_deleted',
              deleted_at = NOW(), updated_at = NOW()
          WHERE id = ${id}
          RETURNING id, name, slug, status, data_location_status, deleted_at, updated_at
        `;
        await writePlatformAudit({
          actor,
          action: 'tenant.soft_deleted',
          entityType: 'tenant',
          entityId: id,
          tenantId: id,
          before: tenant,
          after,
          metadata: { reason, legalHold: Boolean(body.legalHold), revokedSessions, deletionJobId: job.id },
          sql: tx,
        });
        return { job, tenant: after, revokedSessions };
      });
      return successResponse(result);
    }

    if (!tenant.deleted_at || tenant.data_location_status !== 'soft_deleted') {
      throw AppError.conflict('Soft-delete the company before scheduling permanent purge');
    }
    const [hold] = await sql`
      SELECT id FROM tenant_deletion_jobs
      WHERE tenant_id = ${id} AND legal_hold = true AND cancelled_at IS NULL
      ORDER BY requested_at DESC LIMIT 1
    `;
    if (hold) throw AppError.conflict('Remove the legal hold before scheduling permanent purge');

    const retentionDays = Math.max(1, Math.min(365, Number(body.retentionDays || DEFAULT_RETENTION_DAYS)));
    const scheduledFor = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const existing = await sql`
      SELECT id, mode, status, requested_at, scheduled_for, reason
      FROM tenant_deletion_jobs
      WHERE tenant_id = ${id} AND mode = 'purge' AND status IN ('scheduled', 'running')
      ORDER BY requested_at DESC LIMIT 1
    `;
    if (existing[0]) {
      return successResponse(existing[0], { idempotentReplay: true });
    }

    const [job] = await sql`
      INSERT INTO tenant_deletion_jobs
        (tenant_id, mode, status, legal_hold, requested_by, approved_by,
         requested_at, scheduled_for, reason, evidence)
      VALUES
        (${id}, 'purge', 'scheduled', false, ${actor.id}, ${actor.id}, NOW(),
         ${scheduledFor}, ${reason},
         ${JSON.stringify({ retentionDays, confirmation: `DELETE ${tenant.slug}` })}::jsonb)
      RETURNING id, tenant_id, mode, status, requested_at, scheduled_for, reason
    `;
    await writePlatformAudit({
      actor,
      action: 'tenant.purge_scheduled',
      entityType: 'tenant_deletion',
      entityId: job.id,
      tenantId: id,
      after: job,
      metadata: { retentionDays, reason },
    });
    return successResponse(job, {}, 202);
  },
);