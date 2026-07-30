import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  schemaName: 'tenant_11111111111141118111111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  slug: 'tenant-contract',
};

const mocks = vi.hoisted(() => ({
  loadUserAuthz: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  unsafe: vi.fn(),
}));

vi.mock('@/lib/api-utils', () => ({
  successResponse: (data, meta = {}, status = 200) => ({ data, meta, status }),
  parseBody: (request) => request.json(),
  withApiHandler: (_options, handler) => handler,
  tenantSql: () => ({ unsafe: mocks.unsafe }),
}));

vi.mock('@/lib/tenant-context.js', () => ({
  requireAuthContext: () => ctx,
}));

vi.mock('@/lib/auth', () => ({
  hashPassword: vi.fn(async () => '$argon2id$test'),
}));

vi.mock('@/modules/auth/session-service.js', () => ({
  loadUserAuthz: mocks.loadUserAuthz,
  revokeAllUserSessions: mocks.revokeAllUserSessions,
}));

vi.mock('@hippo/rbac', () => ({
  Permission: {
    USER_READ: 'user:read',
    USER_UPDATE: 'user:update',
    USER_DELETE: 'user:delete',
  },
}));

const { GET: getAuthMe } = await import('../../app/api/v1/auth/me/route.js');
const { PATCH: patchUser, DELETE: deleteUser } = await import(
  '../../app/api/v1/admin/users/[id]/route.js'
);

describe('tenant-aware auth and session callers', () => {
  beforeEach(() => {
    mocks.loadUserAuthz.mockReset().mockResolvedValue({
      user: { id: ctx.userId, email: 'admin@tenant.test', name: 'Admin', status: 'active' },
      roles: ['Tenant Admin'],
      permissions: ['user:read'],
      projectIds: [],
      locationIds: [],
    });
    mocks.revokeAllUserSessions.mockReset().mockResolvedValue(undefined);
    mocks.unsafe.mockReset().mockImplementation(async (text) => {
      if (text.includes('SELECT * FROM users')) return [{ id: 'target-user', status: 'active' }];
      if (text.includes('UPDATE users SET')) return [{ id: 'target-user' }];
      if (text.includes('SELECT id, name, email, status, updated_at')) {
        return [{ id: 'target-user', status: 'suspended' }];
      }
      return [];
    });
  });

  it('passes tenantId when /auth/me reloads authorization', async () => {
    const response = await getAuthMe(new Request('http://localhost/api/v1/auth/me'));

    expect(response.status).toBe(200);
    expect(mocks.loadUserAuthz).toHaveBeenCalledWith(ctx.schemaName, ctx.userId, ctx.tenantId);
  });

  it('revokes sessions with tenantId when a user is suspended', async () => {
    await patchUser(
      new Request('http://localhost/api/v1/admin/users/target-user', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'suspended' }),
      }),
      { params: Promise.resolve({ id: 'target-user' }) },
    );

    expect(mocks.revokeAllUserSessions).toHaveBeenCalledWith(
      ctx.schemaName,
      ctx.tenantId,
      'target-user',
    );
  });

  it('revokes sessions with tenantId when a user is deleted', async () => {
    await deleteUser(new Request('http://localhost/api/v1/admin/users/target-user'), {
      params: Promise.resolve({ id: 'target-user' }),
    });

    expect(mocks.revokeAllUserSessions).toHaveBeenCalledWith(
      ctx.schemaName,
      ctx.tenantId,
      'target-user',
    );
  });
});
