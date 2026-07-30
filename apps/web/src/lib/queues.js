import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createControlPlaneSql } from '@hippo/db';
import { provisionTenantSchema, createLogger } from './queues-deps.js';

const log = createLogger({ service: 'queues' });
const QUEUE_NAME = 'tenant.provision';

let _connection = null;
let _queue = null;
let _queueUnavailable = null;

function getConnection() {
  if (!_connection) {
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    _connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  }
  return _connection;
}

export function getTenantProvisionQueue() {
  if (!_queue) _queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  return _queue;
}

async function updateJob(jobId, values) {
  if (!jobId) return;
  const sql = createControlPlaneSql();
  await sql.unsafe(
    `UPDATE provisioning_jobs
     SET status = COALESCE($2, status),
         current_step = COALESCE($3, current_step),
         bullmq_job_id = COALESCE($4, bullmq_job_id),
         error_code = $5,
         error_message = $6,
         started_at = CASE WHEN $7::boolean THEN COALESCE(started_at, NOW()) ELSE started_at END,
         finished_at = CASE WHEN $8::boolean THEN NOW() ELSE finished_at END,
         attempt_count = attempt_count + CASE WHEN $9::boolean THEN 1 ELSE 0 END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      jobId,
      values.status || null,
      values.currentStep || null,
      values.bullmqJobId || null,
      values.errorCode || null,
      values.errorMessage || null,
      Boolean(values.started),
      Boolean(values.finished),
      Boolean(values.incrementAttempt),
    ],
  );
}

async function markTenantProvisioningFailed(tenantId) {
  if (!tenantId) return;
  const sql = createControlPlaneSql();
  await sql`
    UPDATE tenants
    SET status = 'failed',
        data_location_status = 'attention_required',
        updated_at = NOW()
    WHERE id = ${tenantId}
      AND status = 'provisioning'
  `;
}

async function provisionSynchronously(payload) {
  await updateJob(payload.provisioningJobId, {
    status: 'running',
    currentStep: 'starting',
    started: true,
    incrementAttempt: true,
  });
  try {
    const result = await provisionTenantSchema(payload.tenantId, payload.schemaName, {
      adminEmail: payload.adminEmail,
      adminName: payload.adminName,
      onStep: (currentStep) =>
        updateJob(payload.provisioningJobId, { status: 'running', currentStep }),
    });
    await updateJob(payload.provisioningJobId, {
      status: 'completed',
      currentStep: 'active',
      finished: true,
    });
    return { mode: 'sync', result };
  } catch (error) {
    await markTenantProvisioningFailed(payload.tenantId);
    await updateJob(payload.provisioningJobId, {
      status: 'failed',
      currentStep: 'failed',
      errorCode: 'PROVISIONING_FAILED',
      errorMessage: String(error.message).slice(0, 2000),
      finished: true,
    });
    throw error;
  }
}

function classifyQueueFailure(error) {
  const message = String(error?.message || error || '');
  if (/Redis version needs/i.test(message)) return 'unsupported_version';
  if (/ECONNREFUSED|ETIMEDOUT|Connection is closed/i.test(message)) return 'transient';
  return 'fatal';
}

function canProvisionSynchronously() {
  return process.env.PROVISION_SYNC === 'true' || Boolean(process.env.MIGRATION_DATABASE_URL);
}

function resetTransientQueueState() {
  try {
    _connection?.disconnect?.();
  } catch {
    // The connection is already unusable; dropping references is sufficient.
  }
  _connection = null;
  _queue = null;
}

async function recordRetryableQueueFailure(payload, error) {
  await updateJob(payload.provisioningJobId, {
    status: 'queued',
    currentStep: 'registered',
    errorCode: 'QUEUE_RETRYABLE',
    errorMessage: String(error.message).slice(0, 2000),
  });
}

async function recordTerminalQueueFailure(payload, error, errorCode = 'QUEUE_UNAVAILABLE') {
  await markTenantProvisioningFailed(payload.tenantId);
  await updateJob(payload.provisioningJobId, {
    status: 'failed',
    currentStep: 'queue_failed',
    errorCode,
    errorMessage: String(error.message).slice(0, 2000),
    finished: true,
  });
}

/**
 * Enqueue an existing durable provisioning job. The BullMQ id is deterministic,
 * so retries cannot create duplicate queue work.
 */
export async function enqueueTenantProvision(payload) {
  if (!payload.provisioningJobId) {
    throw new Error('provisioningJobId is required');
  }

  if (process.env.PROVISION_SYNC === 'true' || _queueUnavailable) {
    return provisionSynchronously(payload);
  }

  const bullmqJobId = `tenant-provision-${payload.provisioningJobId}`;
  try {
    const queue = getTenantProvisionQueue();
    await queue.add('provision', payload, {
      jobId: bullmqJobId,
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    await updateJob(payload.provisioningJobId, {
      status: 'queued',
      currentStep: 'queued',
      bullmqJobId,
    });
    return { mode: 'queue', bullmqJobId };
  } catch (error) {
    const failureKind = classifyQueueFailure(error);

    if (failureKind === 'unsupported_version') {
      if (canProvisionSynchronously()) {
        _queueUnavailable = String(error.message || error);
        log.warn('Redis version unsupported; provisioning synchronously', {
          err: String(error.message || error),
        });
        return provisionSynchronously(payload);
      }
      await recordTerminalQueueFailure(payload, error, 'QUEUE_REDIS_UNSUPPORTED');
      throw error;
    }

    if (failureKind === 'transient') {
      resetTransientQueueState();
      log.warn('Transient BullMQ failure; queue state will be retried', {
        err: String(error.message || error),
      });

      if (canProvisionSynchronously()) {
        return provisionSynchronously(payload);
      }

      await recordRetryableQueueFailure(payload, error);
      throw error;
    }

    await recordTerminalQueueFailure(payload, error);
    throw error;
  }
}

export function __resetTenantProvisionQueueForTests() {
  _connection = null;
  _queue = null;
  _queueUnavailable = null;
}

export { QUEUE_NAME as TENANT_PROVISION_QUEUE };
