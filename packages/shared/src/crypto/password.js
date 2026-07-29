/**
 * Argon2id password helpers (hash-wasm — works in Next.js without native addons).
 */
import { argon2id } from 'hash-wasm';
import { createHash, randomBytes } from 'node:crypto';

const MEMORY_SIZE = 19456;
const ITERATIONS = 2;
const PARALLELISM = 1;
const HASH_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * Encode as: $argon2id$v=19$m=19456,t=2,p=1$<salt_b64>$<hash_b64>
 * @param {string} password
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await argon2id({
    password,
    salt,
    parallelism: PARALLELISM,
    iterations: ITERATIONS,
    memorySize: MEMORY_SIZE,
    hashLength: HASH_LENGTH,
    outputType: 'binary',
  });
  const saltB64 = Buffer.from(salt).toString('base64url');
  const hashB64 = Buffer.from(hash).toString('base64url');
  return `$argon2id$v=19$m=${MEMORY_SIZE},t=${ITERATIONS},p=${PARALLELISM}$${saltB64}$${hashB64}`;
}

/**
 * @param {string} encoded
 * @param {string} password
 */
export async function verifyPassword(encoded, password) {
  if (!encoded || encoded.startsWith('$pending$')) return false;
  try {
    const parts = encoded.split('$');
    // ['', 'argon2id', 'v=19', 'm=...,t=...,p=...', salt, hash]
    if (parts.length < 6 || parts[1] !== 'argon2id') return false;
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const params = Object.fromEntries(
      parts[3].split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k, Number(v)];
      }),
    );
    const actual = await argon2id({
      password,
      salt,
      parallelism: params.p || PARALLELISM,
      iterations: params.t || ITERATIONS,
      memorySize: params.m || MEMORY_SIZE,
      hashLength: expected.length,
      outputType: 'binary',
    });
    const a = Buffer.from(actual);
    return timingSafeEqualFallback(a, expected);
  } catch {
    return false;
  }
}

function timingSafeEqualFallback(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i] ^ b[i];
  return out === 0;
}

/**
 * SHA-256 hex hash for refresh/reset tokens at rest.
 * @param {string} token
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * @param {number} [bytes=32]
 */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
