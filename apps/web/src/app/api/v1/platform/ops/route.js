import { performance } from 'node:perf_hooks';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { successResponse, withApiHandler, controlPlaneSql } from '@/lib/api-utils';

export const runtime = 'nodejs';

const QUEUES = ['tenant.provision', 'notifications', 'reports'];

async function databaseStatus(sql) {
  const started = performance.now();
  try {
    await sql`SELECT 1 AS ok`;
    return { status: 'healthy', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      status: 'unavailable',
      latencyMs: Math.round(performance.now() - started),
      error: String(error?.message || error),
    };
  }
}

async function redisAndQueueStatus() {
  if (!process.env.REDIS_URL) {
    return {
      redis: { status: 'not_configured', latencyMs: null },
      queues: QUEUES.map((name) => ({ name, status: 'unavailable' })),
    };
  }

  const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
  });
  const queues = [];
  const started = performance.now();
  try {
    await connection.connect();
    const pong = await connection.ping();
    const redis = {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      latencyMs: Math.round(performance.now() - started),
    };

    const queueResults = [];
    for (const name of QUEUES) {
      const queue = new Queue(name, { connection });
      queues.push(queue);
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      );
      queueResults.push({
        name,
        status: counts.failed > 0 ? 'attention' : 'healthy',
        ...counts,
      });
    }
    return { redis, queues: queueResults };
  } catch (error) {
    return {
      redis: {
        status: 'unavailable',
        latencyMs: Math.round(performance.now() - started),
        error: String(error?.message || error),
      },
      queues: QUEUES.map((name) => ({ name, status: 'unavailable' })),
    };
  } finally {
    await Promise.allSettled(queues.map((queue) => queue.close()));
    try {
      await connection.quit();
    } catch {
      connection.disconnect();
    }
  }
}

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async () => {
    const sql = controlPlaneSql();
    const [database, queueStatus] = await Promise.all([
      databaseStatus(sql),
      redisAndQueueStatus(),
    ]);

    const [tenantSummary] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE data_location_status = 'soft_deleted')::int AS soft_deleted,
        COUNT(*) FILTER (WHERE data_location_status = 'purged')::int AS purged,
        COUNT(*) FILTER (
          WHERE deleted_at IS NULL AND (migration_version IS NULL OR data_location_status <> 'ready')
        )::int AS migration_attention
      FROM tenants
    `;

    const [jobSummary] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
        COUNT(*) FILTER (WHERE status = 'running')::int AS running,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE status IN ('queued', 'running') AND updated_at < NOW() - INTERVAL '10 minutes'
        )::int AS stale
      FROM provisioning_jobs
      WHERE created_at > NOW() - INTERVAL '30 days'
    `;

    const recentFailures = await sql`
      SELECT pj.id, pj.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
             pj.status, pj.current_step, pj.error_code, pj.error_message,
             pj.attempt_count, pj.updated_at
      FROM provisioning_jobs pj
      JOIN tenants t ON t.id = pj.tenant_id
      WHERE pj.status = 'failed'
      ORDER BY pj.updated_at DESC
      LIMIT 10
    `;

    const heartbeats = await sql`
      SELECT service_name, instance_id, status, metadata, last_seen_at,
             EXTRACT(EPOCH FROM (NOW() - last_seen_at))::int AS age_seconds
      FROM service_heartbeats
      ORDER BY service_name
    `;

    const offboarding = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
        COUNT(*) FILTER (WHERE status = 'running')::int AS running,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        MIN(scheduled_for) FILTER (WHERE status = 'scheduled') AS next_scheduled_for
      FROM tenant_deletion_jobs
    `;

    const worker = heartbeats.find((item) => item.service_name === 'hippo-worker') || null;
    const workerStatus = !worker
      ? 'missing'
      : worker.status !== 'healthy'
        ? worker.status
        : worker.age_seconds > 45
          ? 'stale'
          : 'healthy';
    const ready =
      database.status === 'healthy' &&
      queueStatus.redis.status === 'healthy' &&
      workerStatus === 'healthy' &&
      jobSummary.stale === 0;

    return successResponse({
      status: ready ? 'healthy' : 'attention',
      checkedAt: new Date().toISOString(),
      services: {
        web: { status: 'healthy' },
        database,
        redis: queueStatus.redis,
        worker: worker ? { ...worker, status: workerStatus } : { status: workerStatus },
      },
      queues: queueStatus.queues,
      tenants: tenantSummary,
      provisioning: jobSummary,
      offboarding,
      recentFailures,
      heartbeats,
    });
  },
);