import { describe, it, expect } from 'vitest';
import {
  requireTenantContext,
  getRequestContext,
  runWithContext,
} from './tenant-context.js';
import { AppError, ErrorCode } from '@hippo/shared';

describe('tenant context', () => {
  it('throws when no context is set', () => {
    expect(() => getRequestContext()).toThrow(AppError);
    try {
      getRequestContext();
    } catch (error) {
      expect(error.code).toBe(ErrorCode.TENANT_CONTEXT_REQUIRED);
    }
  });

  it('requireTenantContext rejects platform-only context', async () => {
    await runWithContext({ requestId: 'r1', isPlatform: true }, () => {
      expect(() => requireTenantContext()).toThrow(AppError);
    });
  });

  it('requireTenantContext returns tenant fields when present', async () => {
    await runWithContext(
      {
        requestId: 'r2',
        tenantId: 't1',
        schemaName: 'tenant_demo',
        userId: 'u1',
      },
      () => {
        const ctx = requireTenantContext();
        expect(ctx.tenantId).toBe('t1');
        expect(ctx.schemaName).toBe('tenant_demo');
      },
    );
  });
});
