import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function channelKeyVersion() {
  return process.env.CHANNEL_CONFIG_KEY_VERSION || 'v1';
}

function keyBytes() {
  const raw = process.env.CHANNEL_CONFIG_KEY;
  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error('CHANNEL_CONFIG_KEY is required in production');
  }
  const material = raw || 'dev-channel-config-key-change-me!!';
  if (material.length < 24) throw new Error('CHANNEL_CONFIG_KEY must be at least 24 characters');
  return createHash('sha256').update(material).digest();
}

export function encryptChannelConfig(config, associatedData = '') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(config), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptChannelConfig(encrypted, associatedData = '') {
  if (!encrypted) return {};
  const buffer = Buffer.from(encrypted, 'base64');
  if (buffer.length < 29) throw new Error('Invalid encrypted channel configuration');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), iv);
  if (associatedData) decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

export function maskChannelConfig(config) {
  const masked = { ...config };
  for (const key of Object.keys(masked)) {
    if (/secret|token|password|key|sid/i.test(key) && typeof masked[key] === 'string') {
      masked[key] = masked[key] ? '••••••••' : '';
    }
  }
  return masked;
}
