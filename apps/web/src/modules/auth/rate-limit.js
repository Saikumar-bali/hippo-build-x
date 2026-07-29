/**
 * Simple in-memory rate limiter for login attempts.
 * Falls back when Redis is unavailable / too old.
 */
const hits = new Map();

/**
 * @param {string} key
 * @param {{ limit?: number, windowMs?: number }} [opts]
 */
export function checkRateLimit(key, opts = {}) {
  const limit = opts.limit ?? 10;
  const windowMs = opts.windowMs ?? 15 * 60 * 1000;
  const now = Date.now();
  const entry = hits.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count += 1;
  hits.set(key, entry);

  if (entry.count > limit) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
  return { allowed: true, remaining: limit - entry.count };
}

export function resetRateLimit(key) {
  hits.delete(key);
}
