import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { AppError } from '@hippo/shared';
import {
  normalizeSubscriptionInput,
  requireSuperAdmin,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

const SELECT_SUBSCRIPTIONS = `
  SELECT
    s.id, s.status, s.starts_at, s.ends_at, s.notes, s.cancelled_at,
    s.created_at, s.updated_at,
    t.id AS tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
    p.id AS plan_id, p.code AS plan_code, p.name AS plan_name,
    p.currency, p.monthly_price_cents, p.annual_price_cents,
    u.email AS assigned_by_email
  FROM subscriptions s
  JOIN tenants t ON t.id = s.tenant_id
  JOIN plans p ON p.id = s.plan_id
  LEFT JOIN platform_users u ON u.id = s.assigned_by
`;

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async () => {
    const sql = controlPlaneSql();
    const rows = await sql.unsafe(
      `${SELECT_SUBSCRIPTIONS}
       WHERE t.deleted_at IS NULL
       ORDER BY t.name,
         CASE WHEN s.status IN ('active','trial','paused') THEN 0 ELSE 1 END,
         s.starts_at DESC`,
    );
    return successResponse(rows);
  },
);

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const input = normalizeSubscriptionInput(await parseBody(request));
    const sql = controlPlaneSql();

    const result = await sql.begin(async (tx) => {
      const [tenant] = await tx`
        SELECT id, name, status FROM tenants
        WHERE id = ${input.tenantId} AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (!tenant) throw AppError.notFound('Company', input.tenantId);
      if (!['active', 'suspended'].includes(tenant.status)) {
        throw AppError.conflict('A plan can be assigned after company setup is complete');
      }

      const [plan] = await tx`
        SELECT id, code, name, status FROM plans WHERE id = ${input.planId} LIMIT 1
      `;
      if (!plan) throw AppError.notFound('Plan', input.planId);
      if (plan.status !== 'active') throw AppError.conflict('Archived plans cannot be assigned');

      const [previous] = await tx`
        SELECT id, plan_id, status, starts_at, ends_at, notes
        FROM subscriptions
        WHERE tenant_id = ${input.tenantId}
          AND status IN ('active', 'trial', 'paused')
        ORDER BY starts_at DESC
        LIMIT 1
        FOR UPDATE
      `;

      if (previous) {
        await tx`
          UPDATE subscriptions
          SET status = 'cancelled',
              ends_at = COALESCE(ends_at, NOW()),
              cancelled_at = NOW(),
              updated_at = NOW()
          WHERE id = ${previous.id}
        `;
      }

      const [subscription] = await tx`
        INSERT INTO subscriptions
          (tenant_id, plan_id, status, starts_at, ends_at, assigned_by, notes)
        VALUES
          (${input.tenantId}, ${input.planId}, ${input.status}, ${input.startsAt},
           ${input.endsAt || null}, ${actor.id}, ${input.notes || null})
        RETURNING id, tenant_id, plan_id, status, starts_at, ends_at, notes,
                  created_at, updated_at
      `;

      await writePlatformAudit({
        actor,
        action: 'subscription.assigned',
        entityType: 'subscription',
        entityId: subscription.id,
        tenantId: input.tenantId,
        before: previous || null,
        after: subscription,
        metadata: { planCode: plan.code, planName: plan.name },
        sql: tx,
      });
      return subscription;
    });

    const [fresh] = await sql.unsafe(`${SELECT_SUBSCRIPTIONS} WHERE s.id = $1`, [result.id]);
    return successResponse(fresh, {}, 201);
  },
);