import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const DEV_KEY = 'dev-channel-config-key-change-me!!';

export function channelKeyVersion() {
  return process.env.CHANNEL_CONFIG_KEY_VERSION || 'v1';
}

function configuredKeyring() {
  let ring = {};
  if (process.env.CHANNEL_CONFIG_KEYS) {
    try {
      ring = JSON.parse(process.env.CHANNEL_CONFIG_KEYS);
    } catch {
      throw new Error('CHANNEL_CONFIG_KEYS must be a JSON object');
    }
  }
  const currentVersion = channelKeyVersion();
  if (process.env.CHANNEL_CONFIG_KEY && !ring[currentVersion]) {
    ring[currentVersion] = process.env.CHANNEL_CONFIG_KEY;
  }
  if (!Object.keys(ring).length && process.env.NODE_ENV !== 'production') {
    ring[currentVersion] = DEV_KEY;
  }
  return ring;
}

function keyBytes(version) {
  const material = configuredKeyring()[version];
  if (!material) throw new Error(`Channel encryption key is unavailable for version ${version}`);
  if (material.length < 24) throw new Error(`Channel encryption key ${version} must be at least 24 characters`);
  return createHash('sha256').update(material).digest();
}

export function encryptChannelConfig(
  config,
  associatedData = '',
  keyVersion = channelKeyVersion(),
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(keyVersion), iv);
  if (associatedData) cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(config), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptChannelConfig(
  encrypted,
  associatedData = '',
  keyVersion = channelKeyVersion(),
) {
  if (!encrypted) return {};
  const buffer = Buffer.from(encrypted, 'base64');
  if (buffer.length < 29) throw new Error('Invalid encrypted channel configuration');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const data = buffer.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(keyVersion), iv);
  if (associatedData) decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Legacy tenant_settings ciphertext did not store a key version or use AAD.
 * Try every retained key so upgrades and rotations can migrate it safely.
 */
export function decryptLegacyChannelConfig(encrypted) {
  if (!encrypted) return { config: {}, keyVersion: null };
  const versions = [channelKeyVersion(), ...Object.keys(configuredKeyring())];
  for (const version of [...new Set(versions)]) {
    try {
      return { config: decryptChannelConfig(encrypted, '', version), keyVersion: version };
    } catch {
      // Try the next retained key version.
    }
  }
  throw new Error('Legacy channel configuration cannot be decrypted with the configured keyring');
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
