import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  provisionTenantSchema,
  runControlPlaneMigrations,
  createControlPlaneSql,
  createLogger,
  validateEnv,
  workerEnvSchema,
} from './deps.js';

const log = createLogger({ service: 'hippo-worker' });
validateEnv(workerEnvSchema);

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

await runControlPlaneMigrations();
log.info('Control plane migrations applied');

async function updateProvisioningJob(jobId, values) {
  if (!jobId) return;
  const sql = createControlPlaneSql();
  await sql.unsafe(
    `UPDATE provisioning_jobs
     SET status = COALESCE($2, status),
         current_step = COALESCE($3, current_step),
         error_code = $4,
         error_message = $5,
         started_at = CASE WHEN $6::boolean THEN COALESCE(started_at, NOW()) ELSE started_at END,
         finished_at = CASE WHEN $7::boolean THEN NOW() ELSE finished_at END,
         attempt_count = attempt_count + CASE WHEN $8::boolean THEN 1 ELSE 0 END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      jobId,
      values.status || null,
      values.currentStep || null,
      values.errorCode || null,
      values.errorMessage || null,
      Boolean(values.started),
      Boolean(values.finished),
      Boolean(values.incrementAttempt),
    ],
  );
}

const tenantProvisionWorker = new Worker(
  'tenant.provision',
  async (job) => {
    const { tenantId, schemaName, adminEmail, adminName, provisioningJobId } = job.data;
    log.info('Provisioning tenant', {
      tenantId,
      schemaName,
      provisioningJobId,
      jobId: job.id,
    });

    await updateProvisioningJob(provisioningJobId, {
      status: 'running',
      currentStep: 'starting',
      started: true,
      incrementAttempt: true,
    });

    try {
      const result = await provisionTenantSchema(tenantId, schemaName, {
        adminEmail,
        adminName,
        onStep: async (currentStep) => {
          await job.updateProgress({ currentStep });
          await updateProvisioningJob(provisioningJobId, { status: 'running', currentStep });
        },
      });
      await updateProvisioningJob(provisioningJobId, {
        status: 'completed',
        currentStep: 'active',
        finished: true,
      });
      log.info('Tenant provisioned', { ...result, provisioningJobId, jobId: job.id });
      return result;
    } catch (error) {
      const message = String(error.message).slice(0, 2000);
      log.error('Tenant provisioning failed', {
        tenantId,
        schemaName,
        provisioningJobId,
        err: message,
        jobId: job.id,
      });

      const sql = createControlPlaneSql();
      await sql`
        UPDATE tenants
        SET status = 'failed', data_location_status = 'attention_required', updated_at = NOW()
        WHERE id = ${tenantId}
      `;
      await updateProvisioningJob(provisioningJobId, {
        status: 'failed',
        currentStep: 'failed',
        errorCode: 'PROVISIONING_FAILED',
        errorMessage: message,
        finished: true,
      });
      // Do not drop the schema. The operator retry path resumes the idempotent
      // steps and preserves evidence needed to diagnose a failed migration.
      throw error;
    }
  },
  { connection },
);

const notificationWorker = new Worker(
  'notifications',
  async (job) => log.info('Notification job', { jobId: job.id, data: job.data }),
  { connection },
);

const reportWorker = new Worker(
  'reports',
  async (job) => log.info('Report job', { jobId: job.id, data: job.data }),
  { connection },
);

tenantProvisionWorker.on('completed', (job) =>
  log.info('tenant.provision completed', { jobId: job.id }),
);
tenantProvisionWorker.on('failed', (job, error) =>
  log.error('tenant.provision failed', { jobId: job?.id, err: error.message }),
);

log.info('Worker started', { queues: ['tenant.provision', 'notifications', 'reports'] });

process.on('SIGTERM', async () => {
  await tenantProvisionWorker.close();
  await notificationWorker.close();
  await reportWorker.close();
  await connection.quit();
  process.exit(0);
});
