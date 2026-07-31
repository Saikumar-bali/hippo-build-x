import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { AppError, ErrorCode } from '@hippo/shared';
import {
  normalizePlanInput,
  requireSuperAdmin,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

export const GET = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async () => {
    const sql = controlPlaneSql();
    const rows = await sql`
      SELECT
        p.id, p.code, p.name, p.description, p.status,
        p.monthly_price_cents, p.annual_price_cents, p.currency,
        p.trial_days, p.display_order, p.entitlements,
        p.created_at, p.updated_at,
        COUNT(DISTINCT s.tenant_id)::int AS subscription_count,
        COUNT(DISTINCT s.tenant_id)
          FILTER (WHERE s.status IN ('active', 'trial', 'paused'))::int AS current_subscription_count
      FROM plans p
      LEFT JOIN subscriptions s ON s.plan_id = p.id
      GROUP BY p.id
      ORDER BY p.display_order, p.name
    `;
    return successResponse(rows);
  },
);

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const input = normalizePlanInput(await parseBody(request));
    const sql = controlPlaneSql();

    const existing = await sql`SELECT id FROM plans WHERE code = ${input.code} LIMIT 1`;
    if (existing[0]) {
      throw new AppError(ErrorCode.ALREADY_EXISTS, `Plan code already exists: ${input.code}`, 409);
    }

    const [plan] = await sql`
      INSERT INTO plans
        (code, name, description, status, monthly_price_cents, annual_price_cents,
         currency, trial_days, display_order, entitlements)
      VALUES
        (${input.code}, ${input.name}, ${input.description || null}, ${input.status},
         ${input.monthlyPriceCents}, ${input.annualPriceCents}, ${input.currency},
         ${input.trialDays}, ${input.displayOrder}, ${JSON.stringify(input.entitlements)}::jsonb)
      RETURNING id, code, name, description, status, monthly_price_cents,
                annual_price_cents, currency, trial_days, display_order,
                entitlements, created_at, updated_at
    `;

    await writePlatformAudit({
      actor,
      action: 'plan.created',
      entityType: 'plan',
      entityId: plan.id,
      after: plan,
    });
    return successResponse(plan, {}, 201);
  },
);