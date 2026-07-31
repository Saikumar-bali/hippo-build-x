import { successResponse, withApiHandler } from '@/lib/api-utils';
import { getTenantHealthSnapshot } from '@/modules/platform/platform-ops-service.js';

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (_request, context) => {
    const { id } = await context.params;
    return successResponse(await getTenantHealthSnapshot(id));
  },
);