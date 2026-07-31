import {
  createControlPlaneSql,
  getMigrationSql,
  assertSafeSchemaName,
  createLogger,
} from './deps.js';

const log = createLogger({ service: 'platform-ops-worker' });
const HEARTBEAT_INTERVAL_MS = 15_000;
const PURGE_INTERVAL_MS = 60_000;

export async function writeWorkerHeartbeat({ instanceId, status = 'healthy', metadata = {} }) {
  const sql = createControlPlaneSql();
  await sql`
    INSERT INTO service_heartbeats
      (service_name, instance_id, status, metadata, last_seen_at, updated_at)
    VALUES
      ('hippo-worker', ${instanceId}, ${status}, ${JSON.stringify(metadata)}::jsonb, NOW(), NOW())
    ON CONFLICT (service_name) DO UPDATE SET
      instance_id = EXCLUDED.instance_id,
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata,
      last_seen_at = NOW(),
      updated_at = NOW()
  `;
}

async function claimDuePurge() {
  const sql = createControlPlaneSql();
  return sql.begin(async (tx) => {
    const [job] = await tx`
      SELECT
        deletion.id, deletion.tenant_id, deletion.requested_by, deletion.reason,
        deletion.scheduled_for, tenant.name, tenant.slug, tenant.schema_name,
        tenant.data_location_status, tenant.deleted_at
      FROM tenant_deletion_jobs deletion
      JOIN tenants tenant ON tenant.id = deletion.tenant_id
      WHERE deletion.mode = 'purge'
        AND deletion.status = 'scheduled'
        AND deletion.legal_hold = false
        AND deletion.scheduled_for <= NOW()
        AND tenant.deleted_at IS NOT NULL
        AND tenant.data_location_status = 'soft_deleted'
      ORDER BY deletion.scheduled_for
      LIMIT 1
      FOR UPDATE OF deletion SKIP LOCKED
    `;
    if (!job) return null;
    await tx`
      UPDATE tenant_deletion_jobs
      SET status = 'running', started_at = NOW(), error_message = NULL
      WHERE id = ${job.id}
    `;
    return job;
  });
}

export async function purgeOneDueTenant() {
  const job = await claimDuePurge();
  if (!job) return null;

  assertSafeSchemaName(job.schema_name);
  const operator = getMigrationSql();
  const control = createControlPlaneSql();

  try {
    await operator.unsafe(`DROP SCHEMA IF EXISTS "${job.schema_name}" CASCADE`);
    const evidence = await control.begin(async (tx) => {
      const [migrationCount] = await tx`
        SELECT COUNT(*)::int AS total FROM tenant_migrations WHERE tenant_id = ${job.tenant_id}
      `;
      const [channelCount] = await tx`
        SELECT COUNT(*)::int AS total FROM tenant_channels WHERE tenant_id = ${job.tenant_id}
      `;
      const [flagCount] = await tx`
        SELECT COUNT(*)::int AS total FROM feature_flags WHERE tenant_id = ${job.tenant_id}
      `;

      await tx`DELETE FROM tenant_migrations WHERE tenant_id = ${job.tenant_id}`;
      await tx`DELETE FROM tenant_channels WHERE tenant_id = ${job.tenant_id}`;
      await tx`DELETE FROM feature_flags WHERE tenant_id = ${job.tenant_id}`;
      await tx`
        UPDATE subscriptions
        SET status = 'cancelled', ends_at = COALESCE(ends_at, NOW()),
            cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
        WHERE tenant_id = ${job.tenant_id}
          AND status IN ('active', 'trial', 'paused')
      `;
      const result = {
        schemaDropped: job.schema_name,
        migrationRecordsRemoved: migrationCount.total,
        channelRecordsRemoved: channelCount.total,
        featureControlsRemoved: flagCount.total,
        completedAt: new Date().toISOString(),
      };
      await tx`
        UPDATE tenants
        SET status = 'suspended', data_location_status = 'purged',
            migration_version = NULL, updated_at = NOW()
        WHERE id = ${job.tenant_id}
      `;
      await tx`
        UPDATE tenant_deletion_jobs
        SET status = 'completed', completed_at = NOW(),
            evidence = COALESCE(evidence, '{}'::jsonb) || ${JSON.stringify(result)}::jsonb
        WHERE id = ${job.id}
      `;
      await tx`
        INSERT INTO platform_audit_logs
          (actor_id, action, entity_type, entity_id, tenant_id, after_state, metadata)
        VALUES
          (${job.requested_by || null}, 'tenant.purged', 'tenant_deletion', ${job.id},
           ${job.tenant_id}, ${JSON.stringify(result)}::jsonb,
           ${JSON.stringify({ reason: job.reason, worker: true })}::jsonb)
      `;
      return result;
    });

    log.info('Tenant purge completed', {
      deletionJobId: job.id,
      tenantId: job.tenant_id,
      slug: job.slug,
      ...evidence,
    });
    return { jobId: job.id, tenantId: job.tenant_id, ...evidence };
  } catch (error) {
    const message = String(error?.message || error).slice(0, 2000);
    await control`
      UPDATE tenant_deletion_jobs
      SET status = 'failed', completed_at = NOW(), error_message = ${message}
      WHERE id = ${job.id}
    `;
    await control`
      INSERT INTO platform_audit_logs
        (actor_id, action, entity_type, entity_id, tenant_id, metadata)
      VALUES
        (${job.requested_by || null}, 'tenant.purge_failed', 'tenant_deletion', ${job.id},
         ${job.tenant_id}, ${JSON.stringify({ error: message, reason: job.reason })}::jsonb)
    `;
    log.error('Tenant purge failed', {
      deletionJobId: job.id,
      tenantId: job.tenant_id,
      err: message,
    });
    throw error;
  }
}

export function startPlatformOpsLoops({ instanceId, queues }) {
  let stopped = false;
  let heartbeatTimer;
  let purgeTimer;

  const heartbeat = async () => {
    if (stopped) return;
    try {
      await writeWorkerHeartbeat({
        instanceId,
        metadata: { queues, pid: process.pid, node: process.version },
      });
    } catch (error) {
      log.warn('Worker heartbeat failed', { err: String(error?.message || error) });
    } finally {
      if (!stopped) heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_INTERVAL_MS);
    }
  };

  const purge = async () => {
    if (stopped) return;
    try {
      while (await purgeOneDueTenant()) {
        // Drain all due jobs serially. The control-plane claim remains safe when
        // multiple workers are running because it uses SKIP LOCKED.
      }
    } catch (error) {
      log.warn('Scheduled purge pass failed', { err: String(error?.message || error) });
    } finally {
      if (!stopped) purgeTimer = setTimeout(purge, PURGE_INTERVAL_MS);
    }
  };

  heartbeat();
  purge();

  return async function stopPlatformOpsLoops() {
    stopped = true;
    clearTimeout(heartbeatTimer);
    clearTimeout(purgeTimer);
    try {
      await writeWorkerHeartbeat({ instanceId, status: 'stopped', metadata: { queues } });
    } catch {
      // Shutdown must continue even if the control plane is unavailable.
    }
  };
}

export { HEARTBEAT_INTERVAL_MS, PURGE_INTERVAL_MS };