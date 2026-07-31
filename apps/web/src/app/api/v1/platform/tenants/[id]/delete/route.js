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

const configuredRetentionDays = Number(process.env.TENANT_PURGE_RETENTION_DAYS || 30);
const DEFAULT_RETENTION_DAYS =
  Number.isInteger(configuredRetentionDays) && configuredRetentionDays >= 1 && configuredRetentionDays <= 365
    ? configuredRetentionDays
    : 30;

function confirmation(body, tenant) {
  const expected = `DELETE ${tenant.slug}`;
  if (String(body.confirmation || '').trim() !== expected) {
    throw AppError.validation(`Type ${expected} to confirm this operation`);
  }
}

function retentionDays(value) {
  const parsed = value === undefined || value === null || value === ''
    ? DEFAULT_RETENTION_DAYS
    : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    throw AppError.validation('Retention period must be a whole number from 1 to 365 days');
  }
  return parsed;
}

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const body = await parseBody(request);
    const mode = body.mode;
    if (!['soft_delete', 'purge', 'release_hold'].includes(mode)) {
      throw AppError.validation('Mode must be soft_delete, purge or release_hold');
    }

    const reason = String(body.reason || '').trim();
    if (reason.length < 10) {
      throw AppError.validation('An offboarding reason of at least 10 characters is required');
    }

    const sql = controlPlaneSql();
    const tenant = await getPlatformTenant(id, { includeDeleted: true, sql });
    confirmation(body, tenant);

    if (mode === 'release_hold') {
      const result = await sql.begin(async (tx) => {
        const [lockedTenant] = await tx`
          SELECT id, deleted_at, data_location_status
          FROM tenants WHERE id = ${id} FOR UPDATE
        `;
        if (!lockedTenant?.deleted_at || lockedTenant.data_location_status !== 'soft_deleted') {
          throw AppError.conflict('Legal holds are managed only during the soft-delete recovery window');
        }
        const [before] = await tx`
          SELECT id, mode, status, legal_hold, reason, evidence, requested_at
          FROM tenant_deletion_jobs
          WHERE tenant_id = ${id} AND legal_hold = true
          ORDER BY requested_at DESC
          LIMIT 1
          FOR UPDATE
        `;
        if (!before) throw AppError.notFound('Active legal hold', id);
        const [after] = await tx`
          UPDATE tenant_deletion_jobs
          SET legal_hold = false,
              evidence = COALESCE(evidence, '{}'::jsonb) ||
                ${JSON.stringify({ legalHoldReleasedAt: new Date().toISOString(), legalHoldReleaseReason: reason })}::jsonb
          WHERE id = ${before.id}
          RETURNING id, mode, status, legal_hold, requested_at, completed_at, reason, evidence
        `;
        await writePlatformAudit({
          actor,
          action: 'tenant.legal_hold_released',
          entityType: 'tenant_deletion',
          entityId: before.id,
          tenantId: id,
          before,
          after,
          metadata: { reason },
          sql: tx,
        });
        return after;
      });
      return successResponse(result);
    }

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
        const [lockedTenant] = await tx`
          SELECT id, name, slug, status, data_location_status, deleted_at
          FROM tenants WHERE id = ${id} FOR UPDATE
        `;
        if (lockedTenant.deleted_at) {
          const [existing] = await tx`
            SELECT id, mode, status, legal_hold, requested_at, completed_at, reason
            FROM tenant_deletion_jobs
            WHERE tenant_id = ${id} AND mode = 'soft_delete'
            ORDER BY requested_at DESC LIMIT 1
          `;
          return { job: existing, tenant: lockedTenant, revokedSessions: 0, idempotentReplay: true };
        }
        if (lockedTenant.status !== 'suspended') {
          throw AppError.conflict('Suspend the company before starting offboarding');
        }
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
          WHERE tenant_id = ${id} AND status IN ('scheduled', 'active', 'trial', 'paused')
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
          before: lockedTenant,
          after,
          metadata: { reason, legalHold: Boolean(body.legalHold), revokedSessions, deletionJobId: job.id },
          sql: tx,
        });
        return { job, tenant: after, revokedSessions };
      });
      return successResponse(result, result.idempotentReplay ? { idempotentReplay: true } : {});
    }

    const days = retentionDays(body.retentionDays);
    const scheduledFor = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const result = await sql.begin(async (tx) => {
      // Serializing on the tenant row, plus the partial unique index, prevents
      // concurrent approvals from creating two active purge jobs.
      const [lockedTenant] = await tx`
        SELECT id, slug, deleted_at, data_location_status
        FROM tenants WHERE id = ${id} FOR UPDATE
      `;
      if (!lockedTenant?.deleted_at || lockedTenant.data_location_status !== 'soft_deleted') {
        throw AppError.conflict('Soft-delete the company before scheduling permanent purge');
      }
      const [hold] = await tx`
        SELECT id FROM tenant_deletion_jobs
        WHERE tenant_id = ${id} AND legal_hold = true
        ORDER BY requested_at DESC LIMIT 1
        FOR UPDATE
      `;
      if (hold) throw AppError.conflict('Remove the legal hold before scheduling permanent purge');

      const [existing] = await tx`
        SELECT id, tenant_id, mode, status, requested_at, scheduled_for, reason
        FROM tenant_deletion_jobs
        WHERE tenant_id = ${id}
          AND mode = 'purge'
          AND status IN ('scheduled', 'running', 'destruction_pending', 'reconciliation_required')
        ORDER BY requested_at DESC LIMIT 1
        FOR UPDATE
      `;
      if (existing) return { job: existing, idempotentReplay: true };

      const [job] = await tx`
        INSERT INTO tenant_deletion_jobs
          (tenant_id, mode, status, legal_hold, requested_by, approved_by,
           requested_at, scheduled_for, reason, evidence)
        VALUES
          (${id}, 'purge', 'scheduled', false, ${actor.id}, ${actor.id}, NOW(),
           ${scheduledFor}, ${reason},
           ${JSON.stringify({ retentionDays: days, confirmation: `DELETE ${lockedTenant.slug}` })}::jsonb)
        RETURNING id, tenant_id, mode, status, requested_at, scheduled_for, reason
      `;
      await writePlatformAudit({
        actor,
        action: 'tenant.purge_scheduled',
        entityType: 'tenant_deletion',
        entityId: job.id,
        tenantId: id,
        after: job,
        metadata: { retentionDays: days, reason },
        sql: tx,
      });
      return { job, idempotentReplay: false };
    });
    return successResponse(
      result.job,
      result.idempotentReplay ? { idempotentReplay: true } : {},
      result.idempotentReplay ? 200 : 202,
    );
  },
);