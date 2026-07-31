import { createControlPlaneSql, createTenantSql } from '@hippo/db';

const KNOWN_MODULES = [
  'projects',
  'crm',
  'progress',
  'notifications',
  'billing',
  'finance',
  'inventory',
  'procurement',
  'dashboards',
  'ai',
  'hrms',
  'mobile',
];

function objectValue(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function flagModuleKey(flagKey) {
  const normalized = String(flagKey || '').toLowerCase();
  if (normalized.startsWith('module.')) return normalized.slice('module.'.length);
  if (normalized.startsWith('module_')) return normalized.slice('module_'.length);
  return KNOWN_MODULES.includes(normalized) ? normalized : null;
}

function planAllowsModule(entitlements, moduleName) {
  const modules = Array.isArray(entitlements.modules) ? entitlements.modules : [];
  if (!modules.length) return true;
  return modules.includes('all') || modules.includes(moduleName);
}

export async function loadTenantCapabilities(schemaName, tenantId) {
  const control = createControlPlaneSql();
  const tenantSql = createTenantSql(schemaName, tenantId);

  const [[subscription], settingRows, platformFlags] = await Promise.all([
    control.unsafe(
      `SELECT s.id, s.status, s.starts_at, s.ends_at,
              p.id AS plan_id, p.code AS plan_code, p.name AS plan_name,
              p.entitlements
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.tenant_id = $1
         AND s.status IN ('active', 'trial', 'paused')
       ORDER BY s.starts_at DESC
       LIMIT 1`,
      [tenantId],
    ),
    tenantSql.unsafe(
      `SELECT feature_flags FROM tenant_settings
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
      [tenantId],
    ),
    control.unsafe(
      `SELECT tenant_id, flag_key, forced_value, reason
       FROM feature_flags
       WHERE tenant_id IS NULL OR tenant_id = $1
       ORDER BY tenant_id NULLS FIRST, flag_key`,
      [tenantId],
    ),
  ]);

  const entitlements = objectValue(subscription?.entitlements);
  const tenantFlags = objectValue(settingRows[0]?.feature_flags);
  const globalControls = new Map();
  const tenantControls = new Map();

  for (const flag of platformFlags) {
    const moduleName = flagModuleKey(flag.flag_key);
    if (!moduleName || flag.forced_value === null) continue;
    const target = flag.tenant_id ? tenantControls : globalControls;
    target.set(moduleName, {
      value: flag.forced_value,
      reason: flag.reason || null,
      flagKey: flag.flag_key,
    });
  }

  const modules = {};
  const decisions = {};
  for (const moduleName of KNOWN_MODULES) {
    const planAllowed = subscription ? planAllowsModule(entitlements, moduleName) : true;
    const tenantAllowed = tenantFlags[moduleName] !== false;
    const globalControl = globalControls.get(moduleName);
    const tenantControl = tenantControls.get(moduleName);

    let enabled = planAllowed && tenantAllowed;
    let source = !planAllowed ? 'plan' : !tenantAllowed ? 'tenant' : 'default';
    let reason = null;

    // A global false is an emergency platform kill-switch and always wins.
    if (globalControl?.value === false) {
      enabled = false;
      source = 'platform_global';
      reason = globalControl.reason;
    } else if (tenantControl?.value === false) {
      enabled = false;
      source = 'platform_company';
      reason = tenantControl.reason;
    } else if (tenantControl?.value === true || globalControl?.value === true) {
      // Platform force-on can override the tenant preference, but never grant a
      // module that the assigned commercial plan does not include.
      enabled = planAllowed;
      source = tenantControl?.value === true ? 'platform_company' : 'platform_global';
      reason = (tenantControl || globalControl)?.reason || null;
    }

    modules[moduleName] = enabled;
    decisions[moduleName] = {
      enabled,
      source,
      reason,
      planAllowed,
      tenantAllowed,
    };
  }

  return {
    plan: subscription
      ? {
          subscriptionId: subscription.id,
          status: subscription.status,
          startsAt: subscription.starts_at,
          endsAt: subscription.ends_at,
          id: subscription.plan_id,
          code: subscription.plan_code,
          name: subscription.plan_name,
          entitlements,
        }
      : null,
    modules,
    moduleDecisions: decisions,
  };
}

export { KNOWN_MODULES };