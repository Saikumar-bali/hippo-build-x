import {
  createControlPlaneSql,
  getMigrationSql,
  assertSafeSchemaName,
  createLogger,
} from './deps.js';
import { purgeTenantObjectStorage } from './object-storage.js';

const log = createLogger({ service: 'platform-ops-worker' });
const HEARTBEAT_INTERVAL_MS = 15_000;
const PLATFORM_OPS_INTERVAL_MS = 60_000;
const PURGE_LEASE_MINUTES = 5;

export async function writeWorkerHeartbeat({ instanceId, status = 'healthy', metadata = {} }) {
  const sql = createControlPlaneSql();
  await sql`
    INSERT INTO service_heartbeats
      (service_name, instance_id, status, metadata, last_seen_at, updated_at)
    VALUES
      ('hippo-worker', ${instanceId}, ${status}, ${JSON.stringify(metadata)}::jsonb, NOW(), NOW())
    ON CONFLICT (service_name, instance_id) DO UPDATE SET
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata,
      last_seen_at = NOW(),
      updated_at = NOW()
  `;
}

export async function reconcileSubscriptions() {
  const sql = createControlPlaneSql();
  const expired = await sql`
    UPDATE subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE status IN ('active', 'trial', 'paused')
      AND ends_at IS NOT NULL
      AND ends_at <= NOW()
    RETURNING id, tenant_id, plan_id, status, ends_at
  `;

  let activated = 0;
  while (true) {
    const result = await sql.begin(async (tx) => {
      const [scheduled] = await tx`
        SELECT subscription.id, subscription.tenant_id, subscription.plan_id,
               subscription.starts_at, subscription.ends_at, subscription.assigned_by,
               plan.name AS plan_name
        FROM subscriptions subscription
        JOIN plans plan ON plan.id = subscription.plan_id
        JOIN tenants tenant ON tenant.id = subscription.tenant_id
        WHERE subscription.status = 'scheduled'
          AND subscription.starts_at <= NOW()
          AND plan.status = 'active'
          AND tenant.deleted_at IS NULL
          AND tenant.status IN ('active', 'suspended')
        ORDER BY subscription.starts_at, subscription.created_at
        LIMIT 1
        FOR UPDATE OF subscription SKIP LOCKED
      `;
      if (!scheduled) return null;

      const [previous] = await tx`
        SELECT id, plan_id, status, starts_at, ends_at
        FROM subscriptions
        WHERE tenant_id = ${scheduled.tenant_id}
          AND id <> ${scheduled.id}
          AND status IN ('active', 'trial', 'paused')
          AND starts_at <= NOW()
          AND (ends_at IS NULL OR ends_at > NOW())
        ORDER BY starts_at DESC
        LIMIT 1
        FOR UPDATE
      `;
      if (previous) {
        await tx`
          UPDATE subscriptions
          SET status = 'cancelled',
              ends_at = LEAST(COALESCE(ends_at, NOW()), NOW()),
              cancelled_at = NOW(), updated_at = NOW()
          WHERE id = ${previous.id}
        `;
      }

      const [after] = await tx`
        UPDATE subscriptions
        SET status = 'active', updated_at = NOW()
        WHERE id = ${scheduled.id}
        RETURNING id, tenant_id, plan_id, status, starts_at, ends_at
      `;
      await tx`
        INSERT INTO platform_audit_logs
          (actor_id, action, entity_type, entity_id, tenant_id,
           before_state, after_state, metadata)
        VALUES
          (${scheduled.assigned_by || null}, 'subscription.activated', 'subscription',
           ${scheduled.id}, ${scheduled.tenant_id},
           ${previous ? JSON.stringify(previous) : null}::jsonb,
           ${JSON.stringify(after)}::jsonb,
           ${JSON.stringify({ scheduled: true, planName: scheduled.plan_name })}::jsonb)
      `;
      return after;
    });
    if (!result) break;
    activated += 1;
  }

  return { expired: expired.length, activated };
}

export async function claimDuePurge({ instanceId }) {
  const sql = createControlPlaneSql();
  return sql.begin(async (tx) => {
    const [job] = await tx`
      SELECT
        deletion.id, deletion.tenant_id, deletion.requested_by, deletion.reason,
        deletion.scheduled_for, deletion.status, deletion.storage_purged_at,
        deletion.schema_dropped_at, deletion.attempt_count,
        tenant.name, tenant.slug, tenant.schema_name, tenant.storage_prefix,
        tenant.data_location_status, tenant.deleted_at
      FROM tenant_deletion_jobs deletion
      JOIN tenants tenant ON tenant.id = deletion.tenant_id
      WHERE deletion.mode = 'purge'
        AND deletion.legal_hold = false
        AND deletion.scheduled_for <= NOW()
        AND tenant.deleted_at IS NOT NULL
        AND tenant.data_location_status = 'soft_deleted'
        AND (
          deletion.status = 'scheduled'
          OR (
            deletion.status IN ('running', 'destruction_pending', 'reconciliation_required')
            AND (deletion.lease_expires_at IS NULL OR deletion.lease_expires_at < NOW())
          )
        )
      ORDER BY deletion.scheduled_for, deletion.requested_at
      LIMIT 1
      FOR UPDATE OF deletion SKIP LOCKED
    `;
    if (!job) return null;

    const [claimed] = await tx`
      UPDATE tenant_deletion_jobs
      SET status = 'running',
          started_at = COALESCE(started_at, NOW()),
          destruction_started_at = COALESCE(destruction_started_at, NOW()),
          lease_owner = ${instanceId},
          lease_expires_at = NOW() + (${PURGE_LEASE_MINUTES} || ' minutes')::interval,
          reconciliation_required = false,
          error_message = NULL,
          attempt_count = attempt_count + 1
      WHERE id = ${job.id}
      RETURNING lease_owner, lease_expires_at, attempt_count
    `;
    return { ...job, ...claimed };
  });
}

async function markPurgeForRetry(job, instanceId, error) {
  const control = createControlPlaneSql();
  const errorMessage = String(error?.message || error).slice(0, 2000);
  await control.begin(async (tx) => {
    await tx`
      UPDATE tenant_deletion_jobs
      SET status = 'reconciliation_required',
          reconciliation_required = true,
          error_message = ${errorMessage},
          lease_owner = NULL,
          lease_expires_at = NULL,
          completed_at = NULL
      WHERE id = ${job.id}
        AND status <> 'completed'
        AND (lease_owner = ${instanceId} OR lease_owner IS NULL)
    `;
    await tx`
      INSERT INTO platform_audit_logs
        (actor_id, action, entity_type, entity_id, tenant_id, metadata)
      VALUES
        (${job.requested_by || null}, 'tenant.purge_retry_required',
         'tenant_deletion', ${job.id}, ${job.tenant_id},
         ${JSON.stringify({ error: errorMessage, reason: job.reason, workerInstanceId: instanceId })}::jsonb)
    `;
  });
  return errorMessage;
}

export async function purgeOneDueTenant({ instanceId }) {
  const job = await claimDuePurge({ instanceId });
  if (!job) return null;

  assertSafeSchemaName(job.schema_name);
  const control = createControlPlaneSql();

  try {
    let storageEvidence = null;
    if (!job.storage_purged_at) {
      await control`
        UPDATE tenant_deletion_jobs
        SET status = 'destruction_pending',
            lease_expires_at = NOW() + (${PURGE_LEASE_MINUTES} || ' minutes')::interval
        WHERE id = ${job.id} AND lease_owner = ${instanceId}
      `;
      storageEvidence = await purgeTenantObjectStorage({
        tenantId: job.tenant_id,
        storagePrefix: job.storage_prefix,
        deletionJobId: job.id,
      });
      await control`
        UPDATE tenant_deletion_jobs
        SET storage_purged_at = NOW(),
            evidence = COALESCE(evidence, '{}'::jsonb) ||
              ${JSON.stringify({ objectStorage: storageEvidence })}::jsonb,
            lease_expires_at = NOW() + (${PURGE_LEASE_MINUTES} || ' minutes')::interval
        WHERE id = ${job.id} AND lease_owner = ${instanceId}
      `;
    }

    // PostgreSQL DDL is transactional. Using the operator connection for both
    // DROP SCHEMA and control-plane completion guarantees that a failure after
    // the DROP rolls the schema deletion back instead of recording a false
    // terminal failure after data was already destroyed.
    const operator = getMigrationSql();
    const evidence = await operator.begin(async (tx) => {
      const [locked] = await tx.unsafe(
        `SELECT status, lease_owner, storage_purged_at, schema_dropped_at
         FROM control_plane.tenant_deletion_jobs
         WHERE id = $1
         FOR UPDATE`,
        [job.id],
      );
      if (!locked) throw new Error(`Deletion job not found: ${job.id}`);
      if (locked.status === 'completed') {
        return { alreadyCompleted: true, completedAt: new Date().toISOString() };
      }
      if (locked.lease_owner !== instanceId) {
        throw new Error('Purge lease is no longer owned by this worker');
      }
      if (!locked.storage_purged_at) {
        throw new Error('Object-storage purge must complete before database destruction');
      }

      const [migrationCount] = await tx.unsafe(
        `SELECT COUNT(*)::int AS total
         FROM control_plane.tenant_migrations WHERE tenant_id = $1`,
        [job.tenant_id],
      );
      const [channelCount] = await tx.unsafe(
        `SELECT COUNT(*)::int AS total
         FROM control_plane.tenant_channels WHERE tenant_id = $1`,
        [job.tenant_id],
      );
      const [flagCount] = await tx.unsafe(
        `SELECT COUNT(*)::int AS total
         FROM control_plane.feature_flags WHERE tenant_id = $1`,
        [job.tenant_id],
      );

      await tx.unsafe(`DROP SCHEMA IF EXISTS "${job.schema_name}" CASCADE`);
      await tx.unsafe(`DELETE FROM control_plane.tenant_migrations WHERE tenant_id = $1`, [
        job.tenant_id,
      ]);
      await tx.unsafe(`DELETE FROM control_plane.tenant_channels WHERE tenant_id = $1`, [
        job.tenant_id,
      ]);
      await tx.unsafe(`DELETE FROM control_plane.feature_flags WHERE tenant_id = $1`, [
        job.tenant_id,
      ]);
      await tx.unsafe(
        `UPDATE control_plane.subscriptions
         SET status = 'cancelled', ends_at = COALESCE(ends_at, NOW()),
             cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW()
         WHERE tenant_id = $1 AND status IN ('scheduled', 'active', 'trial', 'paused')`,
        [job.tenant_id],
      );

      const result = {
        schemaDropped: job.schema_name,
        storagePrefixPurged: job.storage_prefix,
        migrationRecordsRemoved: migrationCount.total,
        channelRecordsRemoved: channelCount.total,
        featureControlsRemoved: flagCount.total,
        completedAt: new Date().toISOString(),
        workerInstanceId: instanceId,
      };
      await tx.unsafe(
        `UPDATE control_plane.tenants
         SET status = 'suspended', data_location_status = 'purged',
             migration_version = NULL, updated_at = NOW()
         WHERE id = $1`,
        [job.tenant_id],
      );
      await tx.unsafe(
        `UPDATE control_plane.tenant_deletion_jobs
         SET status = 'completed', completed_at = NOW(), schema_dropped_at = NOW(),
             reconciliation_required = false, error_message = NULL,
             lease_owner = NULL, lease_expires_at = NULL,
             evidence = COALESCE(evidence, '{}'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [job.id, JSON.stringify(result)],
      );
      await tx.unsafe(
        `INSERT INTO control_plane.platform_audit_logs
          (actor_id, action, entity_type, entity_id, tenant_id, after_state, metadata)
         VALUES ($1, 'tenant.purged', 'tenant_deletion', $2, $3, $4::jsonb, $5::jsonb)`,
        [
          job.requested_by || null,
          job.id,
          job.tenant_id,
          JSON.stringify(result),
          JSON.stringify({ reason: job.reason, worker: true, storageEvidence }),
        ],
      );
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
    const errorMessage = await markPurgeForRetry(job, instanceId, error);
    log.error('Tenant purge requires reconciliation', {
      deletionJobId: job.id,
      tenantId: job.tenant_id,
      err: errorMessage,
    });
    throw error;
  }
}

export function startPlatformOpsLoops({ instanceId, queues }) {
  let stopped = false;
  let heartbeatTimer;
  let operationsTimer;
  let activeOperations = null;

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

  const runOperations = async () => {
    if (stopped) return;
    activeOperations = (async () => {
      const subscriptions = await reconcileSubscriptions();
      if (subscriptions.expired || subscriptions.activated) {
        log.info('Subscription lifecycle reconciled', subscriptions);
      }
      while (await purgeOneDueTenant({ instanceId })) {
        // Drain due purge jobs serially. Claims are leased and use SKIP LOCKED,
        // so additional worker replicas remain safe.
      }
    })();
    try {
      await activeOperations;
    } catch (error) {
      log.warn('Platform operations pass failed', { err: String(error?.message || error) });
    } finally {
      activeOperations = null;
      if (!stopped) operationsTimer = setTimeout(runOperations, PLATFORM_OPS_INTERVAL_MS);
    }
  };

  heartbeat();
  runOperations();

  return async function stopPlatformOpsLoops() {
    stopped = true;
    clearTimeout(heartbeatTimer);
    clearTimeout(operationsTimer);
    if (activeOperations) await activeOperations.catch(() => {});
    try {
      await writeWorkerHeartbeat({ instanceId, status: 'stopped', metadata: { queues } });
    } catch {
      // Shutdown must continue even if the control plane is unavailable.
    }
  };
}

export { HEARTBEAT_INTERVAL_MS, PLATFORM_OPS_INTERVAL_MS, PURGE_LEASE_MINUTES };