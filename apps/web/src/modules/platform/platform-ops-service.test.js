import { describe, expect, it } from 'vitest';
import {
  normalizeFeatureFlagInput,
  normalizePlanInput,
  normalizeSubscriptionInput,
  requireSuperAdmin,
} from './platform-ops-service.js';

describe('platform operations input contracts', () => {
  it('normalizes enforced commercial entitlements and deduplicates modules', () => {
    expect(
      normalizePlanInput({
        code: 'growth_plus',
        name: 'Growth Plus',
        description: 'For growing organizations',
        status: 'active',
        monthlyPriceCents: 399900,
        annualPriceCents: 3999000,
        currency: 'inr',
        trialDays: 14,
        displayOrder: 20,
        entitlements: {
          users: 100,
          projects: 15,
          storageGb: 150,
          modules: ['projects', 'crm', 'projects'],
        },
      }),
    ).toMatchObject({
      code: 'GROWTH_PLUS',
      name: 'Growth Plus',
      status: 'active',
      monthlyPriceCents: 399900,
      annualPriceCents: 3999000,
      currency: 'INR',
      entitlements: {
        users: 100,
        projects: 15,
        modules: ['projects', 'crm'],
      },
    });
    expect(
      normalizePlanInput({
        code: 'NO_MODULES',
        name: 'No Modules',
        entitlements: { users: 1, projects: 1, modules: [] },
      }).entitlements.modules,
    ).toEqual([]);
  });

  it('rejects unsafe plan codes and invalid commercial numbers', () => {
    expect(() =>
      normalizePlanInput({ code: 'growth plan', name: 'Growth', status: 'active' }),
    ).toThrow(/uppercase letters/i);
    expect(() =>
      normalizePlanInput({ code: 'GROWTH', name: 'Growth', status: 'draft' }),
    ).toThrow(/invalid plan status/i);

    for (const value of [-1, 'free', 12.5]) {
      expect(() =>
        normalizePlanInput({
          code: 'GROWTH',
          name: 'Growth',
          monthlyPriceCents: value,
        }),
      ).toThrow(/monthly price/i);
    }
    expect(() =>
      normalizePlanInput({
        code: 'GROWTH',
        name: 'Growth',
        entitlements: { users: 'many', projects: 1, modules: ['projects'] },
      }),
    ).toThrow(/user limit/i);
  });

  it('validates scheduled subscriptions, chronology and lifecycle status', () => {
    expect(
      normalizeSubscriptionInput({
        tenantId: 'tenant-id',
        planId: 'plan-id',
        status: 'scheduled',
        startsAt: '2026-08-10T00:00:00.000Z',
        endsAt: '2026-09-10T00:00:00.000Z',
      }),
    ).toMatchObject({ status: 'scheduled' });

    expect(() =>
      normalizeSubscriptionInput({
        tenantId: 'tenant-id',
        planId: 'plan-id',
        status: 'active',
        startsAt: '2026-08-10T00:00:00.000Z',
        endsAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toThrow(/end date must be later/i);
    expect(() =>
      normalizeSubscriptionInput({
        tenantId: 'tenant-id',
        planId: 'plan-id',
        status: 'unknown',
      }),
    ).toThrow(/invalid subscription status/i);
  });

  it('accepts only auditable forced feature values', () => {
    expect(
      normalizeFeatureFlagInput({
        tenantId: null,
        flagKey: 'module.crm',
        forcedValue: false,
        reason: 'Incident response',
      }),
    ).toEqual({
      tenantId: null,
      flagKey: 'module.crm',
      forcedValue: false,
      reason: 'Incident response',
    });
    expect(() =>
      normalizeFeatureFlagInput({ flagKey: 'module crm', forcedValue: false }),
    ).toThrow(/unsupported characters/i);
    expect(() =>
      normalizeFeatureFlagInput({ flagKey: 'module.crm', forcedValue: 'false' }),
    ).toThrow(/true, false or null/i);
  });

  it('restricts platform writes to super administrators', () => {
    expect(requireSuperAdmin({ id: '1', role: 'super_admin' })).toMatchObject({ id: '1' });
    expect(() => requireSuperAdmin({ id: '2', role: 'support' })).toThrow(
      /super administrator/i,
    );
  });
});
