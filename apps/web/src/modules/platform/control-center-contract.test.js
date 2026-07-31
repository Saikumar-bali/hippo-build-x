import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../app/api/v1/platform/control-center/route.js', import.meta.url),
  'utf8',
);

describe('platform control center contract', () => {
  it('covers every shared PRD section 5 entity', () => {
    for (const table of [
      'tenants',
      'platform_users',
      'plans',
      'subscriptions',
      'provisioning_jobs',
      'tenant_channels',
      'feature_flags',
    ]) {
      expect(source).toContain(table);
    }
  });

  it('never selects control-plane secrets or provisioning payloads', () => {
    expect(source).not.toMatch(/password_hash/i);
    expect(source).not.toMatch(/encrypted_credentials/i);
    expect(source).not.toMatch(/\bpj\.payload\b/i);
    expect(source).not.toMatch(/\bidempotency_key\b/i);
    expect(source).not.toMatch(/\bbullmq_job_id\b/i);
  });
});
