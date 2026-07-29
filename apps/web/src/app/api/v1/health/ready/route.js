import { successResponse, withApiHandler } from '@/lib/api-utils';
import { pingDatabase, isControlPlaneReady } from '@hippo/db';
import { ErrorCode } from '@hippo/shared';
import IORedis from 'ioredis';
import { getRequestId } from '@/lib/tenant-context.js';
import { errorResponse as sharedError } from '@hippo/shared';

async function pingRedis() {
  const REDIS_URL = process.env.REDIS_URL;
  if (!REDIS_URL) return false;
  const client = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  } finally {
    try {
      await client.quit();
    } catch {
      // ignore
    }
  }
}

/**
 * Readiness — Postgres + Redis must be reachable; control plane must exist.
 */
export const GET = withApiHandler({ platform: true }, async () => {
  const [dbOk, redisOk, controlPlaneOk] = await Promise.all([
    pingDatabase().catch(() => false),
    pingRedis(),
    isControlPlaneReady().catch(() => false),
  ]);

  const ready = dbOk && redisOk && controlPlaneOk;
  const payload = {
    status: ready ? 'ready' : 'not_ready',
    checks: {
      database: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
      controlPlane: controlPlaneOk ? 'ok' : 'error',
    },
  };

  if (!ready) {
    const body = sharedError(
      [{ code: ErrorCode.SERVICE_UNAVAILABLE, message: 'Service not ready', details: payload.checks }],
      { checks: payload.checks },
      getRequestId(),
    );
    return Response.json({ ...body, data: payload }, { status: 503 });
  }

  return successResponse(payload);
});
