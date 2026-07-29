import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
const REFRESH_SECRET = new TextEncoder().encode(process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret');

export async function signAccessToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

export async function signRefreshToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(REFRESH_SECRET);
}

export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token) {
  try {
    const { payload } = await jwtVerify(token, REFRESH_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(password) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password, hash) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(password, hash);
}
