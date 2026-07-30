import { describe, expect, it } from 'vitest';
import { shouldApplyTenantDetailResponse } from './tenant-detail-selection.js';

describe('tenant detail response selection guard', () => {
  it('applies only the response for the tenant that remains selected', () => {
    expect(shouldApplyTenantDetailResponse('tenant-a', 'tenant-a')).toBe(true);
    expect(shouldApplyTenantDetailResponse('tenant-b', 'tenant-a')).toBe(false);
  });

  it('ignores responses after the drawer is closed or the request is aborted', () => {
    expect(shouldApplyTenantDetailResponse(null, 'tenant-a')).toBe(false);
    expect(shouldApplyTenantDetailResponse('tenant-a', 'tenant-a', true)).toBe(false);
  });
});
