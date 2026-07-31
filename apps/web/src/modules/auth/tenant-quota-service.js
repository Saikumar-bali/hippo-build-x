import { AppError } from '@hippo/shared';

const RESOURCE_CONFIG = Object.freeze({
  users: { entitlement: 'users', table: 'users', label: 'user' },
  projects: { entitlement: 'projects', table: 'projects', label: 'project' },
});

function limitFor(ctx, resource) {
  const config = RESOURCE_CONFIG[resource];
  if (!config) throw new Error(`Unsupported quota resource: ${resource}`);
  if (!ctx.plan) {
    throw AppError.forbidden('A current commercial subscription is required');
  }
  const value = Number(ctx.plan.entitlements?.[config.entitlement]);
  if (!Number.isInteger(value) || value < -1) {
    throw AppError.forbidden(`The assigned plan has no valid ${config.label} allowance`);
  }
  return { ...config, limit: value };
}

export async function enforceCountQuota(tx, ctx, resource) {
  const config = limitFor(ctx, resource);
  if (config.limit === -1) return { limit: -1, used: null, remaining: null };

  // Serialize concurrent creations for the same tenant/resource so two requests
  // cannot both observe the same remaining slot and exceed the plan.
  await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `quota:${ctx.tenantId}:${resource}`,
  ]);
  const [row] = await tx.unsafe(
    `SELECT COUNT(*)::int AS used
     FROM ${config.table}
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [ctx.tenantId],
  );
  const used = Number(row?.used || 0);
  if (used >= config.limit) {
    throw AppError.conflict(
      `The ${ctx.plan.name} plan allows ${config.limit} ${config.label}${config.limit === 1 ? '' : 's'}. Upgrade the plan before creating another.`,
    );
  }
  return { limit: config.limit, used, remaining: config.limit - used };
}

export function getQuotaLimit(ctx, resource) {
  return limitFor(ctx, resource).limit;
}
