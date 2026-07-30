import { beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = 'retry-contract-key';

const state = vi.hoisted(() => ({
  tenant: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Retry Tenant',
    slug: 'retry-tenant',
    schema_name: 'tenant_11111111111141118111111111111111',
    status: 'failed',
    isolation_mode: 'shared_schema',
  },
  job: null,
  enqueue: vi.fn(),
}));

function query(strings, ...values) {
  const text = strings.join(' ');

  if (text.includes('SELECT id, name, slug, schema_name, status') && text.includes('FROM tenants')) {
    return Promise.resolve([state.tenant]);
  }
  if (text.includes('SELECT payload FROM provisioning_jobs')) {
    return Promise.resolve([{ payload: { adminEmail: 'admin@retry.test', adminName: 'Retry Admin' } }]);
  }
  if (text.includes('SELECT id, tenant_id, status, current_step, payload') && text.includes('WHERE idempotency_key')) {
    return Promise.resolve(state.job ? [state.job] : []);
  }
  if (text.includes('INSERT INTO provisioning_jobs')) {
    if (state.job) return Promise.resolve([]);
    state.job = {
      id: JOB_ID,
      tenant_id: TENANT_ID,
      status: 'queued',
      current_step: 'registered',
      payload: { adminEmail: 'admin@retry.test', adminName: 'Retry Admin' },
    };
    return Promise.resolve([state.job]);
  }
  if (text.includes('UPDATE tenants')) {
    state.tenant.status = 'provisioning';
    return Promise.resolve([]);
  }
  if (text.includes('JOIN provisioning_jobs pj')) {
    return Promise.resolve([
      {
        id: TENANT_ID,
        slug: state.tenant.slug,
        schema_name: state.tenant.schema_name,
        status: state.tenant.status,
        isolation_mode: state.tenant.isolation_mode,
        provisioning_job_id: state.job.id,
        provisioning_job_status: state.job.status,
        provisioning_current_step: state.job.current_step,
      },
    ]);
  }

  throw new Error(`Unexpected SQL in retry route test: ${text} ${JSON.stringify(values)}`);
}
query.begin = (callback) => callback(query);

vi.mock('@/lib/api-utils', () => ({
  successResponse: (data, meta = {}, status = 200) => ({ data, meta, status }),
  withApiHandler: (_options, handler) => handler,
  controlPlaneSql: () => query,
  requirePlatformUser: () => ({ id: '33333333-3333-4333-8333-333333333333' }),
}));

vi.mock('@/lib/queues', () => ({
  enqueueTenantProvision: (...args) => state.enqueue(...args),
}));

const { POST } = await import('./route.js');

function request(key = IDEMPOTENCY_KEY) {
  return new Request(`http://localhost/api/v1/platform/tenants/${TENANT_ID}/retry-provisioning`, {
    method: 'POST',
    headers: { 'idempotency-key': key },
  });
}

const context = { params: Promise.resolve({ id: TENANT_ID }) };

describe('retry provisioning idempotency', () => {
  beforeEach(() => {
    state.tenant.status = 'failed';
    state.job = null;
    state.enqueue.mockReset().mockImplementation(async () => {
      state.job.current_step = 'queued';
      return { mode: 'queue' };
    });
  });

  it('replays the same durable job instead of violating the unique key', async () => {
    const first = await POST(request(), context);
    const second = await POST(request(), context);

    expect(first.data.provisioning_job_id).toBe(JOB_ID);
    expect(second.data.provisioning_job_id).toBe(JOB_ID);
    expect(second.meta).toEqual({ idempotentReplay: true });
    expect(state.enqueue).toHaveBeenCalledTimes(1);
  });

  it.each(['active', 'provisioning', 'suspended'])(
    'rejects retry requests while tenant status is %s',
    async (status) => {
      state.tenant.status = status;

      await expect(POST(request(`retry-${status}`), context)).rejects.toMatchObject({
        code: 'INVALID_STATE_TRANSITION',
        statusCode: 409,
        details: {
          tenantId: TENANT_ID,
          currentStatus: status,
          requiredStatus: 'failed',
        },
      });

      expect(state.job).toBeNull();
      expect(state.enqueue).not.toHaveBeenCalled();
    },
  );
});
