import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provisionTenantSchema: vi.fn(),
  controlQuery: vi.fn(),
  controlUnsafe: vi.fn(),
}));

vi.mock('@hippo/db', () => ({
  createControlPlaneSql: () => {
    const sql = (strings, ...values) => mocks.controlQuery(strings, ...values);
    sql.unsafe = (query, params) => mocks.controlUnsafe(query, params);
    return sql;
  },
}));

vi.mock('./queues-deps.js', () => ({
  provisionTenantSchema: mocks.provisionTenantSchema,
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

vi.mock('bullmq', () => ({ Queue: class Queue {} }));
vi.mock('ioredis', () => ({ default: class IORedis {} }));

const { enqueueTenantProvision } = await import('./queues.js');

describe('tenant provisioning queue fallback', () => {
  beforeEach(() => {
    vi.stubEnv('PROVISION_SYNC', 'true');
    mocks.controlQuery.mockReset().mockResolvedValue([]);
    mocks.controlUnsafe.mockReset().mockResolvedValue([]);
    mocks.provisionTenantSchema.mockReset().mockRejectedValue(new Error('migration failed'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks both the durable job and tenant failed when sync provisioning throws', async () => {
    const payload = {
      tenantId: '11111111-1111-4111-8111-111111111111',
      schemaName: 'tenant_11111111111141118111111111111111',
      provisioningJobId: '22222222-2222-4222-8222-222222222222',
      adminEmail: 'admin@example.test',
      adminName: 'Admin',
    };

    await expect(enqueueTenantProvision(payload)).rejects.toThrow('migration failed');

    const tenantFailureUpdate = mocks.controlQuery.mock.calls.find(([strings]) =>
      strings.join(' ').includes("SET status = 'failed'"),
    );
    expect(tenantFailureUpdate).toBeDefined();
    expect(tenantFailureUpdate.slice(1)).toContain(payload.tenantId);

    const failedJobUpdate = mocks.controlUnsafe.mock.calls.find(
      ([query, params]) => query.includes('UPDATE provisioning_jobs') && params.includes('failed'),
    );
    expect(failedJobUpdate).toBeDefined();
    expect(failedJobUpdate[1]).toContain('PROVISIONING_FAILED');
  });
});
