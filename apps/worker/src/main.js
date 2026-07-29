import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

const notificationWorker = new Worker('notifications', async (job) => {
  console.log(`[Notification] Processing: ${job.id}`, job.data);
  // TODO: Dispatch through email/SMS/WhatsApp adapters
}, { connection });

const reportWorker = new Worker('reports', async (job) => {
  console.log(`[Report] Processing: ${job.id}`, job.data);
  // TODO: Generate PDF reports
}, { connection });

notificationWorker.on('completed', (job) => console.log(`[Notification] Done: ${job.id}`));
notificationWorker.on('failed', (job, err) => console.error(`[Notification] Failed: ${job.id}`, err.message));
reportWorker.on('completed', (job) => console.log(`[Report] Done: ${job.id}`));
reportWorker.on('failed', (job, err) => console.error(`[Report] Failed: ${job.id}`, err.message));

console.log('Worker started. Waiting for jobs...');

process.on('SIGTERM', async () => {
  await notificationWorker.close();
  await reportWorker.close();
  await connection.quit();
  process.exit(0);
});
