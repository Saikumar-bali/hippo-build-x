import { createControlPlaneSql, createTenantSql } from '@hippo/db';
import { AppError, ErrorCode } from '@hippo/shared';
import { getRequestId } from '@/lib/tenant-context.js';

const PLAN_STATUSES = new Set(['active', 'archived']);
const SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'paused', 'expired', 'cancelled']);
const CURRENT_SUBSCRIPTION_STATUSES = new Set(['trial', 'active', 'paused']);

function integer(value, fallback = 0, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function nullableDate(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw AppError.validation(`${fieldName} must be a valid date`);
  return date.toISOString();
}

function requiredText(value, fieldName, maxLength = 255) {
  const normalized = String(value || '').trim();
  if (!normalized) throw AppError.validation(`${fieldName} is required`);
  if (normalized.length > maxLength) {
    throw AppError.validation(`${fieldName} must not exceed ${maxLength} characters`);
  }
  return normalized;
}

export function requireSuperAdmin(user) {
  if (!user || user.role !== 'super_admin') {
    throw AppError.forbidden('Platform super administrator access is required');
  }
  return user;
}

export function normalizePlanInput(body, { partial = false } = {}) {
  const result = {};

  if (!partial || body.code !== undefined) {
    const code = requiredText(body.code, 'Plan code', 100).toUpperCase();
    if (!/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/.test(code)) {
      throw AppError.validation('Plan code must use uppercase letters, numbers and underscores');
    }
    result.code = code;
  }

  if (!partial || body.name !== undefined) result.name = requiredText(body.name, 'Plan name');
  if (body.description !== undefined) result.description = String(body.description || '').trim() || null;

  if (!partial || body.status !== undefined) {
    const status = body.status || 'active';
    if (!PLAN_STATUSES.has(status)) throw AppError.validation('Invalid plan status');
    result.status = status;
  }

  if (body.monthlyPriceCents !== undefined || !partial) {
    result.monthlyPriceCents = integer(body.monthlyPriceCents, 0, { min: 0, max: 1_000_000_000 });
  }
  if (body.annualPriceCents !== undefined || !partial) {
    result.annualPriceCents = integer(body.annualPriceCents, 0, { min: 0, max: 10_000_000_000 });
  }
  if (body.currency !== undefined || !partial) {
    const currency = String(body.currency || 'INR').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw AppError.validation('Currency must be a 3-letter ISO code');
    result.currency = currency;
  }
  if (body.trialDays !== undefined || !partial) {
    result.trialDays = integer(body.trialDays, 0, { min: 0, max: 365 });
  }
  if (body.displayOrder !== undefined || !partial) {
    result.displayOrder = integer(body.displayOrder, 0, { min: 0, max: 10_000 });
  }

  if (body.entitlements !== undefined || !partial) {
    const entitlements = body.entitlements || {};
    if (!entitlements || Array.isArray(entitlements) || typeof entitlements !== 'object') {
      throw AppError.validation('Entitlements must be an object');
    }
    const modules = Array.isArray(entitlements.modules)
      ? [...new Set(entitlements.modules.map((item) => String(item).trim()).filter(Boolean))]
      : [];
    result.entitlements = {
      ...entitlements,
      users: integer(entitlements.users, 0, { min: -1, max: 1_000_000 }),
      projects: integer(entitlements.projects, 0, { min: -1, max: 1_000_000 }),
      storageGb: integer(entitlements.storageGb, 0, { min: 0, max: 1_000_000 }),
      modules,
    };
  }

  return result;
}

export function normalizeSubscriptionInput(body, { partial = false } = {}) {
  const result = {};
  if (!partial || body.tenantId !== undefined) {
    result.tenantId = requiredText(body.tenantId, 'Company', 64);
  }
  if (!partial || body.planId !== undefined) result.planId = requiredText(body.planId, 'Plan', 64);
  if (!partial || body.status !== undefined) {
    const status = body.status || 'active';
    if (!SUBSCRIPTION_STATUSES.has(status)) {
      throw AppError.validation('Invalid subscription status');
    }
    result.status = status;
  }
  if (body.startsAt !== undefined || !partial) {
    result.startsAt = nullableDate(body.startsAt || new Date().toISOString(), 'Start date');
  }
  if (body.endsAt !== undefined) result.endsAt = nullableDate(body.endsAt, 'End date');
  if (body.notes !== undefined) result.notes = String(body.notes || '').trim() || null;

  if (result.startsAt && result.endsAt && new Date(result.endsAt) <= new Date(result.startsAt)) {
    throw AppError.validation('End date must be later than start date');
  }
  return result;
}

export function normalizeFeatureFlagInput(body) {
  const flagKey = requiredText(body.flagKey, 'Feature key', 150).toLowerCase();
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(flagKey)) {
    throw AppError.validation('Feature key contains unsupported characters');
  }
  if (![true, false, null].includes(body.forcedValue)) {
    throw AppError.validation('Forced value must be true, false or null');
  }
  return {
    tenantId: body.tenantId || null,
    flagKey,
    forcedValue: body.forcedValue,
    reason: String(body.reason || '').trim() || null,
  };
}

export async function getPlatformTenant(tenantId, { includeDeleted = false, sql } = {}) {
  const client = sql || createControlPlaneSql();
  const rows = await client.unsafe(
    `SELECT id, name, slug, schema_name, status, isolation_mode, storage_prefix,
            migration_version, data_location_status, created_at, updated_at, deleted_at
     FROM tenants
     WHERE id = $1 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}
     LIMIT 1`,
    [tenantId],
  );
  if (!rows[0]) throw AppError.notFound('Company', tenantId);
  return rows[0];
}

export async function writePlatformAudit({
  actor,
  action,
  entityType,
  entityId,
  tenantId = null,
  before = null,
  after = null,
  metadata = {},
  sql,
}) {
  const client = sql || createControlPlaneSql();
  await client`
    INSERT INTO platform_audit_logs
      (actor_id, actor_email, action, entity_type, entity_id, tenant_id,
       before_state, after_state, metadata, request_id)
    VALUES
      (${actor?.id || null}, ${actor?.email || null}, ${action}, ${entityType},
       ${entityId ? String(entityId) : null}, ${tenantId},
       ${before ? JSON.stringify(before) : null}::jsonb,
       ${after ? JSON.stringify(after) : null}::jsonb,
       ${JSON.stringify(metadata || {})}::jsonb, ${getRequestId() || null})
  `;
}

export async function revokeTenantSessions(tenant) {
  const sql = createTenantSql(tenant.schema_name, tenant.id);
  const rows = await sql.unsafe(
    `UPDATE sessions
     SET revoked_at = COALESCE(revoked_at, NOW()), updated_at = NOW()
     WHERE revoked_at IS NULL AND deleted_at IS NULL
     RETURNING id`,
  );
  return rows.length;
}

export async function countTenantSessions(tenant) {
  try {
    const sql = createTenantSql(tenant.schema_name, tenant.id);
    const [row] = await sql.unsafe(
      `SELECT
         COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at > NOW() AND deleted_at IS NULL)::int AS active,
         COUNT(*)::int AS total
       FROM sessions`,
    );
    return row || { active: 0, total: 0 };
  } catch {
    return { active: null, total: null };
  }
}

export async function getTenantHealthSnapshot(tenantId) {
  const sql = createControlPlaneSql();
  const tenant = await getPlatformTenant(tenantId, { sql });
  const [schemaRow] = await sql.unsafe(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.schemata WHERE schema_name = $1
     ) AS schema_exists`,
    [tenant.schema_name],
  );
  const [migrationRow] = await sql.unsafe(
    `SELECT COUNT(*)::int AS applied, MAX(applied_at) AS last_applied_at
     FROM tenant_migrations WHERE tenant_id = $1`,
    [tenant.id],
  );
  const [job] = await sql.unsafe(
    `SELECT id, status, current_step, attempt_count, error_code, error_message,
            started_at, finished_at, updated_at
     FROM provisioning_jobs
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenant.id],
  );
  const [channels] = await sql.unsafe(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE enabled)::int AS enabled,
       COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verified
     FROM tenant_channels WHERE tenant_id = $1`,
    [tenant.id],
  );
  const [subscription] = await sql.unsafe(
    `SELECT s.id, s.status, s.starts_at, s.ends_at, p.id AS plan_id, p.name AS plan_name
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.tenant_id = $1
     ORDER BY CASE WHEN s.status IN ('active','trial','paused') THEN 0 ELSE 1 END,
              s.starts_at DESC
     LIMIT 1`,
    [tenant.id],
  );
  const sessions = await countTenantSessions(tenant);
  const staleJob = Boolean(
    job && ['queued', 'running'].includes(job.status) && Date.now() - new Date(job.updated_at).getTime() > 10 * 60 * 1000,
  );
  const healthy =
    tenant.status === 'active' &&
    schemaRow?.schema_exists === true &&
    tenant.data_location_status === 'ready' &&
    !staleJob;

  return {
    tenant,
    healthy,
    checks: {
      lifecycle: tenant.status === 'active' ? 'ok' : tenant.status,
      schema: schemaRow?.schema_exists ? 'ok' : 'missing',
      dataLocation: tenant.data_location_status,
      migrations: migrationRow || { applied: 0, last_applied_at: null },
      provisioning: job || null,
      provisioningStale: staleJob,
      channels: channels || { total: 0, enabled: 0, verified: 0 },
      subscription: subscription || null,
      sessions,
    },
  };
}

export function isCurrentSubscriptionStatus(status) {
  return CURRENT_SUBSCRIPTION_STATUSES.has(status);
}

export function platformConflict(message) {
  return new AppError(ErrorCode.CONFLICT, message, 409);
}