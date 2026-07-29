import { successResponse, withApiHandler, requirePlatformUser } from '@/lib/api-utils';

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async () => {
    const user = requirePlatformUser();
    return successResponse({ user });
  },
);
