import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provisionTenantSchema: vi.fn(),
  controlQuery: vi.fn(),
  controlUnsafe: vi.fn(),
  queueAdd: vi.fn(),
  disconnect: vi.fn(),
  warn: vi.fn(),
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
  createLogger: () => ({ warn: mocks.warn, info: vi.fn(), error: vi.fn() }),
}));

vi.mock('bullmq', () => ({
  Queue: class Queue {
    add(...args) {
      return mocks.queueAdd(...args);
    }
  },
}));

vi.mock('ioredis', () => ({
  default: class IORedis {
    disconnect() {
      mocks.disconnect();
    }
  },
}));

const { enqueueTenantProvision, __resetTenantProvisionQueueForTests } = await import('./queues.js');

const payload = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  schemaName: 'tenant_11111111111141118111111111111111',
  provisioningJobId: '22222222-2222-4222-8222-222222222222',
  adminEmail: 'admin@example.test',
  adminName: 'Admin',
};

describe('tenant provisioning queue fallback', () => {
  beforeEach(() => {
    __resetTenantProvisionQueueForTests();
    vi.stubEnv('PROVISION_SYNC', 'false');
    vi.stubEnv('MIGRATION_DATABASE_URL', '');
    mocks.controlQuery.mockReset().mockResolvedValue([]);
    mocks.controlUnsafe.mockReset().mockResolvedValue([]);
    mocks.provisionTenantSchema.mockReset().mockResolvedValue({ status: 'active' });
    mocks.queueAdd.mockReset().mockResolvedValue({});
    mocks.disconnect.mockReset();
    mocks.warn.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks both the durable job and tenant failed when explicit sync provisioning throws', async () => {
    vi.stubEnv('PROVISION_SYNC', 'true');
    mocks.provisionTenantSchema.mockRejectedValue(new Error('migration failed'));

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

  it('does not latch a transient Redis outage and retries Redis on the next request', async () => {
    mocks.queueAdd
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:6379'))
      .mockResolvedValueOnce({});

    await expect(enqueueTenantProvision(payload)).rejects.toThrow('ECONNREFUSED');

    const retryableJobUpdate = mocks.controlUnsafe.mock.calls.find(
      ([query, params]) =>
        query.includes('UPDATE provisioning_jobs') && params.includes('QUEUE_RETRYABLE'),
    );
    expect(retryableJobUpdate).toBeDefined();
    expect(
      mocks.controlQuery.mock.calls.some(([strings]) =>
        strings.join(' ').includes("SET status = 'failed'"),
      ),
    ).toBe(false);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);

    const queued = await enqueueTenantProvision(payload);
    expect(queued.mode).toBe('queue');
    expect(mocks.queueAdd).toHaveBeenCalledTimes(2);
  });

  it('may fall back once for a transient outage without permanently bypassing recovered Redis', async () => {
    vi.stubEnv('MIGRATION_DATABASE_URL', 'postgres://operator@localhost/hippo');
    mocks.queueAdd
      .mockRejectedValueOnce(new Error('Connection is closed'))
      .mockResolvedValueOnce({});

    const first = await enqueueTenantProvision(payload);
    const second = await enqueueTenantProvision(payload);

    expect(first.mode).toBe('sync');
    expect(second.mode).toBe('queue');
    expect(mocks.provisionTenantSchema).toHaveBeenCalledTimes(1);
    expect(mocks.queueAdd).toHaveBeenCalledTimes(2);
  });

  it('permanently latches only an unsupported Redis version when sync fallback is available', async () => {
    vi.stubEnv('MIGRATION_DATABASE_URL', 'postgres://operator@localhost/hippo');
    mocks.queueAdd.mockRejectedValueOnce(new Error('Redis version needs to be 5.0.0 or greater'));

    const first = await enqueueTenantProvision(payload);
    const second = await enqueueTenantProvision(payload);

    expect(first.mode).toBe('sync');
    expect(second.mode).toBe('sync');
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
    expect(mocks.provisionTenantSchema).toHaveBeenCalledTimes(2);
  });

  it('does not reinterpret a post-enqueue database error as a Redis failure', async () => {
    mocks.queueAdd.mockResolvedValue({ id: 'accepted' });
    mocks.controlUnsafe.mockRejectedValueOnce(new Error('database connection reset'));

    const queued = await enqueueTenantProvision(payload);

    expect(queued).toMatchObject({ mode: 'queue' });
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
    expect(
      mocks.controlQuery.mock.calls.some(([strings]) =>
        strings.join(' ').includes("SET status = 'failed'"),
      ),
    ).toBe(false);
    expect(mocks.warn).toHaveBeenCalledWith(
      'Unable to reconcile durable provisioning job state',
      expect.objectContaining({ currentStep: 'queued', mode: 'queue' }),
    );
  });

  it('does not reverse synchronous provisioning when success reporting fails', async () => {
    vi.stubEnv('PROVISION_SYNC', 'true');
    mocks.controlUnsafe.mockRejectedValue(new Error('database connection reset'));

    const result = await enqueueTenantProvision(payload);

    expect(result.mode).toBe('sync');
    expect(mocks.provisionTenantSchema).toHaveBeenCalledTimes(1);
    expect(
      mocks.controlQuery.mock.calls.some(([strings]) =>
        strings.join(' ').includes("SET status = 'failed'"),
      ),
    ).toBe(false);
  });
});
