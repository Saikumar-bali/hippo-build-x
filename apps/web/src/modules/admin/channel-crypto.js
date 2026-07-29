import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

function keyBytes() {
  const raw = process.env.CHANNEL_CONFIG_KEY || 'dev-channel-config-key-change-me!!';
  return createHash('sha256').update(raw).digest();
}

/**
 * @param {object} config
 */
export function encryptChannelConfig(config) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const plaintext = Buffer.from(JSON.stringify(config), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * @param {string|null} encrypted
 */
export function decryptChannelConfig(encrypted) {
  if (!encrypted) return {};
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

/**
 * Mask secrets for API responses.
 */
export function maskChannelConfig(config) {
  const masked = { ...config };
  for (const key of Object.keys(masked)) {
    if (/secret|token|password|key|api/i.test(key) && typeof masked[key] === 'string') {
      masked[key] = masked[key] ? '••••••••' : '';
    }
  }
  return masked;
}
