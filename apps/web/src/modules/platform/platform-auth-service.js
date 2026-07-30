import { createControlPlaneSql } from '@hippo/db';
import { AppError } from '@hippo/shared';
import {
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/lib/auth.js';

export async function loginPlatformUser({ email, password }) {
  const sql = createControlPlaneSql();
  const rows = await sql`
    SELECT id, email, name, password_hash, role, status
    FROM platform_users
    WHERE lower(email) = lower(${email}) AND deleted_at IS NULL
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || user.status !== 'active') {
    throw AppError.unauthorized('Invalid credentials');
  }

  if (!(await verifyPassword(user.password_hash, password))) {
    throw AppError.unauthorized('Invalid credentials');
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    scope: 'platform',
  });
  const refreshToken = await signRefreshToken({
    sub: user.id,
    scope: 'platform',
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function refreshPlatformSession(refreshToken) {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload?.sub || payload.scope !== 'platform') {
    throw AppError.unauthorized('Invalid refresh token');
  }
  const user = await loadPlatformUser(payload.sub);
  if (!user) throw AppError.unauthorized('Invalid refresh token');

  return {
    accessToken: await signAccessToken({ sub: user.id, scope: 'platform' }),
    refreshToken: await signRefreshToken({ sub: user.id, scope: 'platform' }),
    user,
  };
}

export async function loadPlatformUser(userId) {
  const sql = createControlPlaneSql();
  const rows = await sql`
    SELECT id, email, name, role, status
    FROM platform_users
    WHERE id = ${userId} AND deleted_at IS NULL
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || user.status !== 'active') return null;
  return user;
}
