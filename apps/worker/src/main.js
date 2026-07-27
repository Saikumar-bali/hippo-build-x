import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * Notification worker — processes email, SMS, WhatsApp jobs.
 */
const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    console.log(`Processing notification job: ${job.id}`, job.data);
    // TODO: Dispatch through @hippo/notifications adapters
  },
  { connection },
);

/**
 * Report worker — generates PDFs, demand letters, large reports.
 */
const reportWorker = new Worker(
  'reports',
  async (job) => {
    console.log(`Processing report job: ${job.id}`, job.data);
    // TODO: Generate report and store in object storage
  },
  { connection },
);

/**
 * AI worker — runs AI inference tasks.
 */
const aiWorker = new Worker(
  'ai',
  async (job) => {
    console.log(`Processing AI job: ${job.id}`, job.data);
    // TODO: Run through @hippo/ai service with guardrails
  },
  { connection },
);

notificationWorker.on('completed', (job) => {
  console.log(`Notification job ${job.id} completed`);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`Notification job ${job.id} failed:`, err.message);
});

reportWorker.on('completed', (job) => {
  console.log(`Report job ${job.id} completed`);
});

reportWorker.on('failed', (job, err) => {
  console.error(`Report job ${job.id} failed:`, err.message);
});

aiWorker.on('completed', (job) => {
  console.log(`AI job ${job.id} completed`);
});

aiWorker.on('failed', (job, err) => {
  console.error(`AI job ${job.id} failed:`, err.message);
});

console.log('Worker processes started. Waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await notificationWorker.close();
  await reportWorker.close();
  await aiWorker.close();
  await connection.quit();
  process.exit(0);
});
