import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const here = import.meta.url;
const component = readFileSync(new URL('./PlatformControlCenter.js', here), 'utf8');
const css = readFileSync(new URL('./PlatformControlCenter.module.css', here), 'utf8');
const migration = readFileSync(
  new URL('../../../../../packages/db/src/migrations/control/006_phase12_platform_ops.sql', here),
  'utf8',
);
const authCapabilities = readFileSync(
  new URL('../auth/tenant-capability-service.js', here),
  'utf8',
);
const apiUtils = readFileSync(new URL('../../lib/api-utils.js', here), 'utf8');
const rbacGuard = readFileSync(
  new URL('../../../../../packages/rbac/src/guards/index.js', here),
  'utf8',
);
const workerOps = readFileSync(
  new URL('../../../../../apps/worker/src/platform-ops.js', here),
  'utf8',
);

const requiredRoutes = [
  '../../app/api/v1/platform/plans/route.js',
  '../../app/api/v1/platform/plans/[id]/route.js',
  '../../app/api/v1/platform/subscriptions/route.js',
  '../../app/api/v1/platform/subscriptions/[id]/route.js',
  '../../app/api/v1/platform/feature-flags/route.js',
  '../../app/api/v1/platform/tenants/[id]/status/route.js',
  '../../app/api/v1/platform/tenants/[id]/feature-flags/route.js',
  '../../app/api/v1/platform/tenants/[id]/health/route.js',
  '../../app/api/v1/platform/tenants/[id]/revoke-sessions/route.js',
  '../../app/api/v1/platform/tenants/[id]/export/route.js',
  '../../app/api/v1/platform/tenants/[id]/delete/route.js',
  '../../app/api/v1/platform/ops/route.js',
  '../../app/api/v1/platform/audit/route.js',
];

describe('complete platform operations contract', () => {
  it('ships every platform operations endpoint', () => {
    for (const route of requiredRoutes) {
      expect(existsSync(new URL(route, here)), route).toBe(true);
    }
  });

  it('uses a real admin information architecture without temporary phase copy', () => {
    for (const section of [
      'Platform overview',
      'Organizations',
      'Plans & subscriptions',
      'Feature controls',
      'Platform operations',
      'Audit & access',
      'Security & isolation',
    ]) {
      expect(component).toContain(section);
    }
    expect(component).not.toMatch(/Phase 12/i);
    expect(component).not.toContain('Automatic protection');
    expect(css).toContain('linear-gradient');
    expect(css).toContain('.sider');
    expect(css).toContain('.kpiGrid');
  });

  it('persists commercial, audit, export, deletion and heartbeat records', () => {
    for (const table of [
      'platform_audit_logs',
      'tenant_export_jobs',
      'tenant_deletion_jobs',
      'service_heartbeats',
    ]) {
      expect(migration).toContain(`control_plane.${table}`);
    }
    expect(migration).toContain('subscriptions_one_current_per_tenant_idx');
    expect(migration).toContain("WHERE status IN ('active', 'trial', 'paused')");
    expect(migration).toContain("'STARTER'");
    expect(migration).toContain("'GROWTH'");
    expect(migration).toContain("'ENTERPRISE'");
  });

  it('enforces feature controls and plan entitlements during authorization', () => {
    expect(apiUtils).toContain('loadTenantCapabilities');
    expect(apiUtils).toContain('modules: capabilities.modules');
    expect(rbacGuard).toContain('ctx.modules?.[moduleName] === false');
    expect(authCapabilities).toContain('A global false is an emergency platform kill-switch');
    expect(authCapabilities).toContain('planAllowsModule');
    expect(authCapabilities).toContain("source = 'platform_company'");
  });

  it('executes offboarding with serialized worker evidence and heartbeat', () => {
    expect(workerOps).toContain('FOR UPDATE OF deletion SKIP LOCKED');
    expect(workerOps).toContain('DROP SCHEMA IF EXISTS');
    expect(workerOps).toContain("'tenant.purged'");
    expect(workerOps).toContain('service_heartbeats');
    expect(workerOps).toContain('setTimeout(heartbeat');
    expect(workerOps).toContain('setTimeout(purge');
    expect(workerOps).not.toContain('setInterval(');
  });

  it('exposes guarded operational actions in the admin console', () => {
    for (const action of [
      'Suspend company',
      'Resume company',
      'Revoke all sessions',
      'Export company data',
      'Offboard company',
      'Schedule purge',
      'Assign plan',
      'Add control',
    ]) {
      expect(component).toContain(action);
    }
    expect(component).toContain('DELETE {tenantAction.tenant?.slug}');
  });
});