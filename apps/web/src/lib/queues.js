import { Queue } from 'bullmq';
import IORedis from 'ioredis';
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
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return _queue;
}

function shouldSyncProvision(error) {
  if (process.env.PROVISION_SYNC === 'true') return true;
  const message = String(error?.message || error || '');
  return /Redis version needs to be greater or equal than 5/i.test(message);
}

/**
 * Enqueue tenant provisioning, or run the provisioner inline when Redis
 * cannot support BullMQ (e.g. Windows Redis 3.x) or PROVISION_SYNC=true.
 * @param {{ tenantId: string, schemaName: string, slug: string, adminEmail?: string, adminName?: string }} payload
 * @returns {Promise<{ mode: 'queue'|'sync', result?: object }>}
 */
export async function enqueueTenantProvision(payload) {
  if (process.env.PROVISION_SYNC === 'true' || _queueUnavailable) {
    const result = await provisionTenantSchema(payload.tenantId, payload.schemaName, {
      adminEmail: payload.adminEmail,
      adminName: payload.adminName,
    });
    return { mode: 'sync', result };
  }

  try {
    const queue = getTenantProvisionQueue();
    const jobId = `provision-${payload.tenantId}-${Date.now()}`;
    await queue.add('provision', payload, {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return { mode: 'queue' };
  } catch (error) {
    if (!shouldSyncProvision(error)) throw error;
    _queueUnavailable = error.message;
    log.warn('BullMQ unavailable; provisioning synchronously', { err: error.message });
    const result = await provisionTenantSchema(payload.tenantId, payload.schemaName, {
      adminEmail: payload.adminEmail,
      adminName: payload.adminName,
    });
    return { mode: 'sync', result };
  }
}

export { QUEUE_NAME as TENANT_PROVISION_QUEUE };
