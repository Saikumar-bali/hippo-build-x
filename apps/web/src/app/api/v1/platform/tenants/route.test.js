import { beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const PLATFORM_USER_ID = '33333333-3333-4333-8333-333333333333';
const IDEMPOTENCY_KEY = 'tenant-create-race-key';
const PAYLOAD = { adminEmail: 'admin@concurrent.test', adminName: 'Concurrent Admin' };

const state = vi.hoisted(() => ({
  tenant: null,
  job: null,
  enqueue: vi.fn(),
  precheckMode: 'state',
  precheckCount: 0,
  releasePrechecks: null,
  transactionTail: Promise.resolve(),
}));

function tenantProjection() {
  if (!state.tenant || !state.job) return null;
  return {
    ...state.tenant,
    provisioning_job_id: state.job.id,
    provisioning_job_status: state.job.status,
    provisioning_current_step: state.job.current_step,
    provisioning_attempt_count: state.job.attempt_count,
    provisioning_job_payload: state.job.payload,
  };
}

function makeQuery({ transaction = false } = {}) {
  const query = async (strings, ...values) => {
    const text = strings.join(' ');

    if (text.includes('pg_advisory_xact_lock')) return [];
    if (text.includes('SELECT id FROM tenants WHERE slug')) {
      return state.tenant ? [{ id: state.tenant.id }] : [];
    }
    if (text.includes('INSERT INTO tenants')) {
      const [id, name, slug, schemaName, status, isolationMode] = values;
      state.tenant = {
        id,
        name,
        slug,
        schema_name: schemaName,
        status,
        isolation_mode: isolationMode,
        database_region: null,
        migration_version: null,
        data_location_status: 'provisioning',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return [state.tenant];
    }
    if (text.includes('INSERT INTO provisioning_jobs')) {
      const [tenantId, idempotencyKey, _requestedBy, payload] = values;
      state.job = {
        id: JOB_ID,
        tenant_id: tenantId,
        idempotency_key: idempotencyKey,
        status: 'queued',
        current_step: 'registered',
        attempt_count: 0,
        payload: JSON.parse(payload),
      };
      return [state.job];
    }

    throw new Error(`Unexpected tagged SQL: ${text} ${JSON.stringify(values)}`);
  };

  query.unsafe = async (text) => {
    if (text.includes('same_job.idempotency_key')) {
      if (transaction) return state.job ? [tenantProjection()] : [];
      if (state.precheckMode === 'state') return state.job ? [tenantProjection()] : [];

      state.precheckCount += 1;
      if (state.precheckCount === 1) {
        await new Promise((resolve) => {
          state.releasePrechecks = resolve;
        });
      } else if (state.precheckCount === 2) {
        state.releasePrechecks();
      }
      return [];
    }

    if (text.includes('WHERE t.id = $1')) {
      return state.tenant && state.job ? [tenantProjection()] : [];
    }

    throw new Error(`Unexpected unsafe SQL: ${text}`);
  };

  return query;
}

const sql = makeQuery();
sql.begin = async (callback) => {
  const previous = state.transactionTail;
  let release;
  state.transactionTail = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await callback(makeQuery({ transaction: true }));
  } finally {
    release();
  }
};

vi.mock('@/lib/api-utils', () => ({
  successResponse: (data, meta = {}, status = 200) => ({ data, meta, status }),
  parseBody: (request) => request.json(),
  withApiHandler: (_options, handler) => handler,
  controlPlaneSql: () => sql,
  requirePlatformUser: () => ({ id: PLATFORM_USER_ID }),
}));

vi.mock('@hippo/db', () => ({
  toTenantSchemaName: () => 'tenant_11111111111141118111111111111111',
  TENANT_STATUS: { PROVISIONING: 'provisioning' },
  ISOLATION_MODE: { SHARED_SCHEMA: 'shared_schema' },
}));

vi.mock('@hippo/shared', () => {
  class AppError extends Error {
    constructor(code, message, status) {
      super(message);
      this.code = code;
      this.status = status;
    }

    static validation(message) {
      return new AppError('VALIDATION_ERROR', message, 400);
    }
  }

  return { AppError, ErrorCode: { ALREADY_EXISTS: 'ALREADY_EXISTS' } };
});

vi.mock('@/lib/queues', () => ({
  enqueueTenantProvision: (...args) => state.enqueue(...args),
}));

const { POST } = await import('./route.js');

function request() {
  return new Request('http://localhost/api/v1/platform/tenants', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY_KEY,
    },
    body: JSON.stringify({
      name: 'Concurrent Tenant',
      slug: 'concurrent-tenant',
      adminEmail: PAYLOAD.adminEmail,
      adminName: PAYLOAD.adminName,
    }),
  });
}

function seedCommittedRegisteredJob() {
  state.tenant = {
    id: TENANT_ID,
    name: 'Concurrent Tenant',
    slug: 'concurrent-tenant',
    schema_name: 'tenant_11111111111141118111111111111111',
    status: 'provisioning',
    isolation_mode: 'shared_schema',
    database_region: null,
    migration_version: null,
    data_location_status: 'provisioning',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.job = {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    idempotency_key: IDEMPOTENCY_KEY,
    status: 'queued',
    current_step: 'registered',
    attempt_count: 0,
    payload: PAYLOAD,
  };
}

describe('tenant creation idempotency', () => {
  beforeEach(() => {
    state.tenant = null;
    state.job = null;
    state.precheckMode = 'state';
    state.precheckCount = 0;
    state.releasePrechecks = null;
    state.transactionTail = Promise.resolve();
    state.enqueue.mockReset().mockImplementation(async () => {
      state.job.status = 'queued';
      state.job.current_step = 'queued';
      return { mode: 'queue' };
    });
  });

  it('atomically replays concurrent requests with the same idempotency key', async () => {
    state.precheckMode = 'barrier';
    const [first, second] = await Promise.all([POST(request()), POST(request())]);
    const responses = [first, second];

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(responses.every((response) => response.data.provisioning_job_id === JOB_ID)).toBe(true);
    expect(responses.find((response) => response.status === 200).meta).toEqual({
      idempotentReplay: true,
    });
    expect(state.enqueue.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(
      state.enqueue.mock.calls.every(
        ([payload]) => payload.provisioningJobId === JOB_ID && payload.tenantId === TENANT_ID,
      ),
    ).toBe(true);
    expect(state.job.idempotency_key).toBe(IDEMPOTENCY_KEY);
  });

  it('enqueues a committed registered job when the original process died before dispatch', async () => {
    seedCommittedRegisteredJob();

    const replay = await POST(request());

    expect(replay.status).toBe(200);
    expect(replay.meta).toEqual({ idempotentReplay: true });
    expect(replay.data.provisioning_job_id).toBe(JOB_ID);
    expect(replay.data.provisioning_job_payload).toBeUndefined();
    expect(state.enqueue).toHaveBeenCalledTimes(1);
    expect(state.enqueue).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      schemaName: state.tenant.schema_name,
      slug: state.tenant.slug,
      adminEmail: PAYLOAD.adminEmail,
      adminName: PAYLOAD.adminName,
      provisioningJobId: JOB_ID,
    });
  });
});
