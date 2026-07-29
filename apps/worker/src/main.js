import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  provisionTenantSchema,
  rollbackTenantProvisioning,
  runControlPlaneMigrations,
  createLogger,
  validateEnv,
  workerEnvSchema,
} from './deps.js';

const log = createLogger({ service: 'hippo-worker' });

validateEnv(workerEnvSchema);

const REDIS_URL = process.env.REDIS_URL;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Ensure control plane exists before processing jobs
await runControlPlaneMigrations();
log.info('Control plane migrations applied');

const tenantProvisionWorker = new Worker(
  'tenant.provision',
  async (job) => {
    const { tenantId, schemaName, adminEmail, adminName } = job.data;
    log.info('Provisioning tenant', { tenantId, schemaName, jobId: job.id });

    try {
      const result = await provisionTenantSchema(tenantId, schemaName, {
        adminEmail,
        adminName,
      });
      log.info('Tenant provisioned', { ...result, jobId: job.id });
      return result;
    } catch (error) {
      log.error('Tenant provisioning failed', {
        tenantId,
        schemaName,
        err: error.message,
        jobId: job.id,
      });
      try {
        await rollbackTenantProvisioning(schemaName, tenantId);
      } catch (rollbackError) {
        log.error('Rollback failed', { err: rollbackError.message, schemaName });
      }
      throw error;
    }
  },
  { connection },
);

const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    log.info('Notification job', { jobId: job.id, data: job.data });
  },
  { connection },
);

const reportWorker = new Worker(
  'reports',
  async (job) => {
    log.info('Report job', { jobId: job.id, data: job.data });
  },
  { connection },
);

tenantProvisionWorker.on('completed', (job) =>
  log.info('tenant.provision completed', { jobId: job.id }),
);
tenantProvisionWorker.on('failed', (job, err) =>
  log.error('tenant.provision failed', { jobId: job?.id, err: err.message }),
);

log.info('Worker started', { queues: ['tenant.provision', 'notifications', 'reports'] });

process.on('SIGTERM', async () => {
  await tenantProvisionWorker.close();
  await notificationWorker.close();
  await reportWorker.close();
  await connection.quit();
  process.exit(0);
});
