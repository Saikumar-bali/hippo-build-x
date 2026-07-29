import { getSql } from '@hippo/db';
import { AppError } from '@hippo/shared';
import {
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '@/lib/auth.js';

/**
 * @param {{ email: string, password: string }} input
 */
export async function loginPlatformUser({ email, password }) {
  const sql = getSql();
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

  const ok = await verifyPassword(user.password_hash, password);
  if (!ok) throw AppError.unauthorized('Invalid credentials');

  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scope: 'platform',
  });

  const refreshToken = await signRefreshToken({
    sub: user.id,
    scope: 'platform',
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

/**
 * @param {string} refreshToken
 */
export async function refreshPlatformSession(refreshToken) {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload?.sub || payload.scope !== 'platform') {
    throw AppError.unauthorized('Invalid refresh token');
  }
  const user = await loadPlatformUser(payload.sub);
  if (!user) throw AppError.unauthorized('Invalid refresh token');

  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scope: 'platform',
  });
  const nextRefresh = await signRefreshToken({
    sub: user.id,
    scope: 'platform',
  });

  return { accessToken, refreshToken: nextRefresh, user };
}

/**
 * @param {string} userId
 */
export async function loadPlatformUser(userId) {
  const sql = getSql();
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
