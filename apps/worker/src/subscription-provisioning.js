import { createControlPlaneSql } from './deps.js';

export async function ensureStarterTrial(tenantId) {
  const sql = createControlPlaneSql();
  return sql.begin(async (tx) => {
    const [tenant] = await tx`
      SELECT id, name FROM tenants WHERE id = ${tenantId} FOR UPDATE
    `;
    if (!tenant) throw new Error(`Tenant not found while assigning Starter trial: ${tenantId}`);

    const [existing] = await tx`
      SELECT id, status, starts_at, ends_at
      FROM subscriptions
      WHERE tenant_id = ${tenantId}
        AND (
          (
            status IN ('active', 'trial', 'paused')
            AND starts_at <= NOW()
            AND (ends_at IS NULL OR ends_at > NOW())
          )
          OR status = 'scheduled'
        )
      ORDER BY starts_at DESC
      LIMIT 1
      FOR UPDATE
    `;
    if (existing) return { created: false, subscription: existing };

    const [plan] = await tx`
      SELECT id, code, name, trial_days
      FROM plans
      WHERE code = 'STARTER' AND status = 'active'
      FOR SHARE
    `;
    if (!plan) throw new Error('Active STARTER plan is required for tenant provisioning');

    const [subscription] = await tx`
      INSERT INTO subscriptions
        (tenant_id, plan_id, status, starts_at, ends_at, notes)
      VALUES
        (${tenantId}, ${plan.id}, 'trial', NOW(),
         NOW() + (${plan.trial_days} || ' days')::interval,
         'Automatic Starter trial created during tenant provisioning')
      RETURNING id, tenant_id, plan_id, status, starts_at, ends_at
    `;
    await tx`
      INSERT INTO platform_audit_logs
        (action, entity_type, entity_id, tenant_id, after_state, metadata)
      VALUES
        ('subscription.trial_started', 'subscription', ${subscription.id}, ${tenantId},
         ${JSON.stringify(subscription)}::jsonb,
         ${JSON.stringify({ planCode: plan.code, planName: plan.name, automatic: true })}::jsonb)
    `;
    return { created: true, subscription };
  });
}
