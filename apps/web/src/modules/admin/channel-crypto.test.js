import { afterEach, describe, expect, it } from 'vitest';
import {
  encryptChannelConfig,
  decryptChannelConfig,
  maskChannelConfig,
  channelKeyVersion,
} from './channel-crypto.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('tenant channel credential encryption', () => {
  it('round-trips credentials only with the matching tenant/channel AAD', () => {
    process.env.CHANNEL_CONFIG_KEY = 'test-channel-key-that-is-at-least-32-characters';
    const credentials = { apiKey: 'secret-value', username: 'mailer' };
    const encrypted = encryptChannelConfig(credentials, 'tenant-a:email');

    expect(encrypted).not.toContain('secret-value');
    expect(decryptChannelConfig(encrypted, 'tenant-a:email')).toEqual(credentials);
    expect(() => decryptChannelConfig(encrypted, 'tenant-b:email')).toThrow();
    expect(() => decryptChannelConfig(encrypted, 'tenant-a:sms')).toThrow();
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

  it('exposes an explicit encryption key version', () => {
    process.env.CHANNEL_CONFIG_KEY_VERSION = 'kms-2026-07';
    expect(channelKeyVersion()).toBe('kms-2026-07');
  });

  it('rejects missing production keys instead of using a development fallback', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CHANNEL_CONFIG_KEY;
    expect(() => encryptChannelConfig({ token: 'secret' }, 'tenant-a:whatsapp')).toThrow(
      'CHANNEL_CONFIG_KEY is required in production',
    );
  });
});
