import { SignJWT, jwtVerify } from 'jose';
import { hashPassword, verifyPassword, hashToken, generateToken } from '@hippo/shared/crypto';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function accessSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
}

function refreshSecret() {
  return new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret');
}

/**
 * @param {object} payload
 */
export async function signAccessToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(accessSecret());
}

/**
 * @param {object} payload
 */
export async function signRefreshToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(refreshSecret());
}

export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, accessSecret());
    return payload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token) {
  try {
    const { payload } = await jwtVerify(token, refreshSecret());
    return payload;
  } catch {
    return null;
  }
}

export { hashPassword, verifyPassword, hashToken, generateToken, REFRESH_TTL_MS };
