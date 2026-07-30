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

function shouldSyncProvision(error) {
  if (process.env.PROVISION_SYNC === 'true') return true;
  const message = String(error?.message || error || '');
  return /Redis version needs|ECONNREFUSED|ETIMEDOUT|Connection is closed/i.test(message);
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
    if (!shouldSyncProvision(error)) {
      await updateJob(payload.provisioningJobId, {
        status: 'failed',
        currentStep: 'queue_failed',
        errorCode: 'QUEUE_UNAVAILABLE',
        errorMessage: String(error.message).slice(0, 2000),
        finished: true,
      });
      throw error;
    }
    _queueUnavailable = error.message;
    log.warn('BullMQ unavailable; provisioning synchronously', { err: error.message });
    return provisionSynchronously(payload);
  }
}

export { QUEUE_NAME as TENANT_PROVISION_QUEUE };
