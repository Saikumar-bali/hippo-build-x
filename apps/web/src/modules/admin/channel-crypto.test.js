import { afterEach, describe, expect, it } from 'vitest';
import {
  encryptChannelConfig,
  decryptChannelConfig,
  decryptLegacyChannelConfig,
  maskChannelConfig,
  channelKeyVersion,
} from './channel-crypto.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
});

describe('tenant channel credential encryption', () => {
  it('round-trips only with matching tenant/channel AAD', () => {
    process.env.CHANNEL_CONFIG_KEY = 'test-channel-key-that-is-at-least-32-characters';
    const credentials = { apiKey: 'secret-value', username: 'mailer' };
    const encrypted = encryptChannelConfig(credentials, 'tenant-a:email');
    expect(encrypted).not.toContain('secret-value');
    expect(decryptChannelConfig(encrypted, 'tenant-a:email')).toEqual(credentials);
    expect(() => decryptChannelConfig(encrypted, 'tenant-b:email')).toThrow();
    expect(() => decryptChannelConfig(encrypted, 'tenant-a:sms')).toThrow();
  });

  it('decrypts old rows with their stored key version after rotation', () => {
    process.env.CHANNEL_CONFIG_KEY_VERSION = 'v2';
    process.env.CHANNEL_CONFIG_KEYS = JSON.stringify({
      v1: 'old-channel-key-that-is-at-least-32-characters',
      v2: 'new-channel-key-that-is-at-least-32-characters',
    });
    const oldCiphertext = encryptChannelConfig({ token: 'old-secret' }, 'tenant-a:whatsapp', 'v1');
    expect(decryptChannelConfig(oldCiphertext, 'tenant-a:whatsapp', 'v1')).toEqual({
      token: 'old-secret',
    });
    expect(() => decryptChannelConfig(oldCiphertext, 'tenant-a:whatsapp', 'v2')).toThrow();
    const newCiphertext = encryptChannelConfig(
      decryptChannelConfig(oldCiphertext, 'tenant-a:whatsapp', 'v1'),
      'tenant-a:whatsapp',
      'v2',
    );
    expect(decryptChannelConfig(newCiphertext, 'tenant-a:whatsapp', 'v2')).toEqual({
      token: 'old-secret',
    });
  });

  it('discovers the retained key for unversioned legacy ciphertext', () => {
    process.env.CHANNEL_CONFIG_KEY_VERSION = 'v1';
    process.env.CHANNEL_CONFIG_KEY = 'old-channel-key-that-is-at-least-32-characters';
    const legacy = encryptChannelConfig({ smtpApiKey: 'legacy-secret' }, '', 'v1');

    process.env.CHANNEL_CONFIG_KEY_VERSION = 'v2';
    delete process.env.CHANNEL_CONFIG_KEY;
    process.env.CHANNEL_CONFIG_KEYS = JSON.stringify({
      v1: 'old-channel-key-that-is-at-least-32-characters',
      v2: 'new-channel-key-that-is-at-least-32-characters',
    });
    expect(decryptLegacyChannelConfig(legacy)).toEqual({
      config: { smtpApiKey: 'legacy-secret' },
      keyVersion: 'v1',
    });
  });

  it('masks every secret-like response field', () => {
    expect(
      maskChannelConfig({
        apiKey: 'a',
        authToken: 'b',
        accountSid: 'c',
        password: 'd',
        from: 'notify@example.com',
      }),
    ).toEqual({
      apiKey: '••••••••',
      authToken: '••••••••',
      accountSid: '••••••••',
      password: '••••••••',
      from: 'notify@example.com',
    });
  });

  it('exposes an explicit current key version', () => {
    process.env.CHANNEL_CONFIG_KEY_VERSION = 'kms-2026-07';
    expect(channelKeyVersion()).toBe('kms-2026-07');
  });

  it('rejects missing production keyrings', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CHANNEL_CONFIG_KEY;
    delete process.env.CHANNEL_CONFIG_KEYS;
    expect(() => encryptChannelConfig({ token: 'secret' }, 'tenant-a:whatsapp')).toThrow(
      'Channel encryption key is unavailable for version',
    );
  });
});
