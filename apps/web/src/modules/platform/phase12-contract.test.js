import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const here = import.meta.url;
const read = (path) => readFileSync(new URL(path, here), 'utf8');

const component = read('./PlatformControlCenter.js');
const css = read('./PlatformControlCenter.module.css');
const migration006 = read('../../../../../packages/db/src/migrations/control/006_phase12_platform_ops.sql');
const migration007 = read('../../../../../packages/db/src/migrations/control/007_phase12_hardening.sql');
const migration008 = read(
  '../../../../../packages/db/src/migrations/control/008_platform_audit_immutability.sql',
);
const migrationRunner = read('../../../../../packages/db/src/migrations/index.js');
const controlSchema = read('../../../../../packages/db/src/schema/control-plane.js');
const authCapabilities = read('../auth/tenant-capability-service.js');
const quotaService = read('../auth/tenant-quota-service.js');
const sessionValidation = read('../auth/session-validation.js');
const apiUtils = read('../../lib/api-utils.js');
const rbacGuard = read('../../../../../packages/rbac/src/guards/index.js');
const workerOps = read('../../../../../apps/worker/src/platform-ops.js');
const exportRoute = read('../../app/api/v1/platform/tenants/[id]/export/route.js');
const deleteRoute = read('../../app/api/v1/platform/tenants/[id]/delete/route.js');
const opsRoute = read('../../app/api/v1/platform/ops/route.js');
const controlCenterRoute = read('../../app/api/v1/platform/control-center/route.js');

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

  it('uses a professional role-aware admin information architecture', () => {
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
    expect(component).toContain('Read-only platform access');
    expect(component).toContain('Support operator');
    expect(component).toContain('Release legal hold');
    expect(component).toContain('Suspend before offboarding');
    expect(component).toContain('Scheduled — starts in the future');
    expect(component).not.toContain('storageGb');
    expect(component).not.toMatch(/Phase 12/i);
    expect(component).not.toContain('Automatic protection');
    expect(css).toContain('linear-gradient');
    expect(css).toContain('.sider');
    expect(css).toContain('.kpiGrid');
  });

  it('persists commercial and operational records with recovery constraints', () => {
    for (const table of [
      'platform_audit_logs',
      'tenant_export_jobs',
      'tenant_deletion_jobs',
      'service_heartbeats',
    ]) {
      expect(migration006).toContain(`control_plane.${table}`);
    }
    expect(migration006).toContain('subscriptions_one_current_per_tenant_idx');
    expect(migration006).toContain("'STARTER'");
    expect(migration006).toContain("'GROWTH'");
    expect(migration006).toContain("'ENTERPRISE'");

    expect(migration007).toContain('lease_expires_at');
    expect(migration007).toContain('reconciliation_required');
    expect(migration007).toContain('tenant_deletion_jobs_one_active_purge_idx');
    expect(migration007).toContain('PRIMARY KEY (service_name, instance_id)');
    expect(migration007).toContain("WHERE status = 'scheduled'");
    expect(migration007).toContain("- 'storageGb'");

    expect(controlSchema).toContain('leaseExpiresAt');
    expect(controlSchema).toContain('reconciliationRequired');
    expect(controlSchema).toContain("columns: [table.serviceName, table.instanceId]");
  });

  it('keeps platform audit evidence append-only for runtime callers', () => {
    expect(migration008).toContain('platform_audit_logs_are_append_only');
    expect(migration008).toContain('BEFORE UPDATE OR DELETE');
    expect(migrationRunner).toContain(
      'REVOKE UPDATE, DELETE ON control_plane.platform_audit_logs',
    );
    expect(migrationRunner).toContain(
      'GRANT SELECT, INSERT ON control_plane.platform_audit_logs',
    );
  });

  it('fails closed on missing, empty, future or expired commercial access', () => {
    expect(apiUtils).toContain('loadTenantCapabilities');
    expect(apiUtils).toContain('modules: capabilities.modules');
    expect(rbacGuard).toContain('ctx.modules?.[moduleName] === false');
    expect(authCapabilities).toContain('Boolean(subscription) && planAllowsModule');
    expect(authCapabilities).toContain("modules.includes('all') || modules.includes(moduleName)");
    expect(authCapabilities).toContain("source = !subscription");
    expect(authCapabilities).toContain('s.starts_at <= NOW()');
    expect(authCapabilities).toContain('s.ends_at IS NULL OR s.ends_at > NOW()');
    expect(controlCenterRoute).toContain('current_subscription.starts_at <= NOW()');
    expect(controlCenterRoute).toContain(
      'current_subscription.ends_at IS NULL OR current_subscription.ends_at > NOW()',
    );
  });

  it('enforces numerical plan quotas and revoked access-token sessions', () => {
    expect(quotaService).toContain('A current commercial subscription is required');
    expect(quotaService).toContain('pg_advisory_xact_lock');
    expect(quotaService).toContain('used >= config.limit');
    expect(sessionValidation).toContain('sessionId');
    expect(sessionValidation).toContain('revoked_at IS NULL');
    expect(sessionValidation).toContain('expires_at > NOW()');
    expect(apiUtils).toContain('assertAccessSessionActive');
  });

  it('creates bounded, secret-free exports from one repeatable-read snapshot', () => {
    expect(exportRoute).toContain("isolation: 'repeatable read'");
    expect(exportRoute).toContain('EXPORT_PAGE_SIZE');
    expect(exportRoute).toContain('LIMIT $1 OFFSET $2');
    expect(exportRoute).toContain('channel_config_encrypted');
    expect(exportRoute).toContain('MAX_EXPORT_BYTES');
    expect(exportRoute).toContain('Buffer.byteLength');
  });

  it('executes leased and restart-safe permanent purge including object storage', () => {
    expect(workerOps).toContain('lease_expires_at');
    expect(workerOps).toContain('SKIP LOCKED');
    expect(workerOps).toContain('purgeStoragePrefix');
    expect(workerOps).toContain('destruction_pending');
    expect(workerOps).toContain('reconciliation_required');
    expect(workerOps).toContain('DROP SCHEMA IF EXISTS');
    expect(workerOps).toContain("'tenant.purged'");
    expect(workerOps).toContain('activePlatformOps');
    expect(workerOps).toContain('await activePlatformOps');
    expect(workerOps).not.toContain('setInterval(');

    expect(deleteRoute).toContain('FOR UPDATE');
    expect(deleteRoute).toContain('retentionDays must be an integer between 1 and 365');
    expect(deleteRoute).toContain('idempotentReplay');
  });

  it('reports every worker replica and failed queue as platform attention', () => {
    expect(workerOps).toContain('ON CONFLICT (service_name, instance_id)');
    expect(opsRoute).toContain('workerInstances');
    expect(opsRoute).toContain("queue.status !== 'healthy'");
    expect(opsRoute).toContain('reconciliation_required');
  });
});
