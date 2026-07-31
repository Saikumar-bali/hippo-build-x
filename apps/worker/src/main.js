import { randomUUID } from 'node:crypto';
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
import { reportProvisioningStep } from './provisioning-progress.js';
import { startPlatformOpsLoops } from './platform-ops.js';
import { ensureStarterTrial } from './subscription-provisioning.js';

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

function warnReportingFailure({ error, currentStep, channel, tenantId, provisioningJobId, jobId }) {
  log.warn('Unable to report provisioning state', {
    tenantId,
    provisioningJobId,
    jobId,
    currentStep,
    channel,
    err: String(error?.message || error),
  });
}

async function reportJobState({
  currentStep,
  values,
  job,
  tenantId,
  provisioningJobId,
  includeBullMqProgress = false,
}) {
  return reportProvisioningStep({
    currentStep,
    updateDurableState: () => updateProvisioningJob(provisioningJobId, values),
    updateProgress: includeBullMqProgress
      ? () => job.updateProgress({ currentStep })
      : async () => {},
    onDurableError: (error, step) =>
      warnReportingFailure({
        error,
        currentStep: step,
        channel: 'control_plane',
        tenantId,
        provisioningJobId,
        jobId: job.id,
      }),
    onProgressError: (error, step) =>
      warnReportingFailure({
        error,
        currentStep: step,
        channel: 'bullmq',
        tenantId,
        provisioningJobId,
        jobId: job.id,
      }),
  });
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
    await reportJobState({
      currentStep: 'starting',
      values: {
        status: 'running',
        currentStep: 'starting',
        started: true,
        clearFinished: true,
        incrementAttempt: true,
      },
      job,
      tenantId,
      provisioningJobId,
    });

    try {
      const result = await provisionTenantSchema(tenantId, schemaName, {
        adminEmail,
        adminName,
        onStep: (currentStep) =>
          reportJobState({
            currentStep,
            values: { status: 'running', currentStep },
            job,
            tenantId,
            provisioningJobId,
            includeBullMqProgress: true,
          }),
      });
      const starterTrial = await ensureStarterTrial(tenantId);
      await reportJobState({
        currentStep: 'active',
        values: { status: 'completed', currentStep: 'active', finished: true },
        job,
        tenantId,
        provisioningJobId,
      });
      log.info('Tenant provisioned', {
        ...result,
        starterTrialCreated: starterTrial.created,
        provisioningJobId,
        jobId: job.id,
      });
      return { ...result, starterTrialCreated: starterTrial.created };
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

      try {
        await sql`
          UPDATE tenants
          SET status = ${failure.tenantStatus},
              data_location_status = ${failure.dataLocationStatus},
              updated_at = NOW()
          WHERE id = ${tenantId}
        `;
      } catch (reportingError) {
        warnReportingFailure({
          error: reportingError,
          currentStep: failure.currentStep,
          channel: 'tenant_failure_state',
          tenantId,
          provisioningJobId,
          jobId: job.id,
        });
      }

      try {
        await updateProvisioningJob(provisioningJobId, {
          status: failure.jobStatus,
          currentStep: failure.currentStep,
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
          finished: failure.finished,
          clearFinished: failure.clearFinished,
        });
      } catch (reportingError) {
        warnReportingFailure({
          error: reportingError,
          currentStep: failure.currentStep,
          channel: 'control_plane_failure_state',
          tenantId,
          provisioningJobId,
          jobId: job.id,
        });
      }
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

const queues = ['tenant.provision', 'notifications', 'reports'];
const workerInstanceId = process.env.WORKER_INSTANCE_ID || process.env.HOSTNAME || randomUUID();
const stopPlatformOps = startPlatformOpsLoops({ instanceId: workerInstanceId, queues });

log.info('Worker started', { queues, workerInstanceId });

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('Worker shutting down', { signal, workerInstanceId });
  await stopPlatformOps();
  await Promise.all([
    tenantProvisionWorker.close(),
    notificationWorker.close(),
    reportWorker.close(),
  ]);
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));