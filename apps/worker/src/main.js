import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  provisionTenantSchema,
  isControlPlaneReady,
  createControlPlaneSql,
  createLogger,
  validateEnv,
  workerEnvSchema,
} from './deps.js';
import {
  getProvisioningAttemptState,
  getProvisioningFailureTransition,
} from './provisioning-attempt.js';

const log = createLogger({ service: 'hippo-worker' });
validateEnv(workerEnvSchema);

if (!(await isControlPlaneReady())) {
  throw new Error(
    'Control plane is not ready. Run db:migrate:control and db:migrate:tenants with MIGRATION_DATABASE_URL before starting the worker.',
  );
}

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

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
         finished_at = CASE
           WHEN $7::boolean THEN NOW()
           WHEN $8::boolean THEN NULL
           ELSE finished_at
         END,
         attempt_count = attempt_count + CASE WHEN $9::boolean THEN 1 ELSE 0 END,
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
      Boolean(values.clearFinished),
      Boolean(values.incrementAttempt),
    ],
  );
}

const tenantProvisionWorker = new Worker(
  'tenant.provision',
  async (job) => {
    const { tenantId, schemaName, adminEmail, adminName, provisioningJobId } = job.data;
    const attempt = getProvisioningAttemptState(job);
    const sql = createControlPlaneSql();

    log.info('Provisioning tenant', {
      tenantId,
      schemaName,
      provisioningJobId,
      jobId: job.id,
      attempt: attempt.attemptNumber,
      configuredAttempts: attempt.configuredAttempts,
    });

    await sql`
      UPDATE tenants
      SET status = 'provisioning',
          data_location_status = ${attempt.attemptNumber > 1 ? 'retrying' : 'provisioning'},
          updated_at = NOW()
      WHERE id = ${tenantId} AND status <> 'active'
    `;
    await updateProvisioningJob(provisioningJobId, {
      status: 'running',
      currentStep: 'starting',
      started: true,
      clearFinished: true,
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
      const errorMessage = String(error.message).slice(0, 2000);
      const failure = getProvisioningFailureTransition(job, errorMessage);

      log.error('Tenant provisioning failed', {
        tenantId,
        schemaName,
        provisioningJobId,
        err: errorMessage,
        jobId: job.id,
        attempt: failure.attemptNumber,
        configuredAttempts: failure.configuredAttempts,
        terminal: failure.isFinalAttempt,
      });

      await sql`
        UPDATE tenants
        SET status = ${failure.tenantStatus},
            data_location_status = ${failure.dataLocationStatus},
            updated_at = NOW()
        WHERE id = ${tenantId}
      `;
      await updateProvisioningJob(provisioningJobId, {
        status: failure.jobStatus,
        currentStep: failure.currentStep,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        finished: failure.finished,
        clearFinished: failure.clearFinished,
      });
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
