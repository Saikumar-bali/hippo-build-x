import { successResponse, withApiHandler } from '@/lib/api-utils';

/**
 * Liveness — process is up. Does not check dependencies.
 */
export const GET = withApiHandler({ platform: true }, async () => {
  return successResponse({
    status: 'ok',
    service: 'hippo-web',
    timestamp: new Date().toISOString(),
  });
});
