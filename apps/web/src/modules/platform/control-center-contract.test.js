import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  new URL('../../app/api/v1/platform/control-center/route.js', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./PlatformControlCenter.js', import.meta.url),
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
      expect(routeSource).toContain(table);
    }
  });

  it('never selects control-plane secrets or provisioning payloads', () => {
    expect(routeSource).not.toMatch(/password_hash/i);
    expect(routeSource).not.toMatch(/encrypted_credentials/i);
    expect(routeSource).not.toMatch(/\bpj\.payload\b/i);
    expect(routeSource).not.toMatch(/\bidempotency_key\b/i);
    expect(routeSource).not.toMatch(/\bbullmq_job_id\b/i);
  });

  it('paginates setup activity without using the page as tenant detail state', () => {
    expect(routeSource).toContain("url.searchParams.get('jobsPage')");
    expect(routeSource).toContain('LIMIT ${jobsPageSize}');
    expect(routeSource).toContain('OFFSET ${jobsOffset}');
    expect(routeSource).not.toContain('LIMIT 100');
    expect(routeSource).toContain('latest_job.id AS provisioning_job_id');
    expect(componentSource).toContain('selected.provisioning_job_id');
    expect(componentSource).not.toContain('selectedJobs[0]');
  });

  it('uses the same subscription selected by the organization query', () => {
    expect(componentSource).toContain('item.id === selected.subscription_id');
    expect(componentSource).not.toContain('item.tenant_id === selectedId');
  });

  it('renders platform administrators returned by the API', () => {
    expect(componentSource).toContain('data.platformUsers');
    expect(componentSource).toContain('Platform administrators');
  });
});
