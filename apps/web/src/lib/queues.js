/**
 * Queue utilities for background jobs.
 * Uses BullMQ with Redis.
 */

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const notificationQueue = new Queue('notifications', { connection });
export const reportQueue = new Queue('reports', { connection });
export const aiQueue = new Queue('ai', { connection });

/**
 * Add a notification job to the queue.
 */
export async function enqueueNotification(data, opts) {
  return notificationQueue.add('send', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    ...opts,
  });
}

/**
 * Add a report generation job to the queue.
 */
export async function enqueueReport(data, opts) {
  return reportQueue.add('generate', data, {
    attempts: 2,
    ...opts,
  });
}

/**
 * Add an AI inference job to the queue.
 */
export async function enqueueAiTask(data, opts) {
  return aiQueue.add('infer', data, {
    attempts: 2,
    ...opts,
  });
}
