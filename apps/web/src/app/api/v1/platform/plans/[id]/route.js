import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { AppError } from '@hippo/shared';
import {
  normalizePlanInput,
  requireSuperAdmin,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

export const PATCH = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const input = normalizePlanInput(await parseBody(request), { partial: true });
    if (!Object.keys(input).length) throw AppError.validation('No plan fields to update');
    const sql = controlPlaneSql();

    try {
      const plan = await sql.begin(async (tx) => {
        // The row lock conflicts with the FOR SHARE lock used by subscription
        // assignment, so a plan cannot be archived while it is being assigned.
        const [before] = await tx`
          SELECT id, code, name, description, status, monthly_price_cents,
                 annual_price_cents, currency, trial_days, display_order,
                 entitlements, created_at, updated_at
          FROM plans
          WHERE id = ${id}
          FOR UPDATE
        `;
        if (!before) throw AppError.notFound('Plan', id);

        if (input.code && input.code !== before.code) {
          const duplicate = await tx`
            SELECT id FROM plans WHERE code = ${input.code} AND id <> ${id} LIMIT 1
          `;
          if (duplicate[0]) throw AppError.conflict(`Plan code already exists: ${input.code}`);
        }

        if (input.status === 'archived' && before.status !== 'archived') {
          const [usage] = await tx`
            SELECT COUNT(*)::int AS total
            FROM subscriptions
            WHERE plan_id = ${id}
              AND status IN ('active', 'trial', 'paused')
              AND starts_at <= NOW()
              AND (ends_at IS NULL OR ends_at > NOW())
          `;
          if (usage.total > 0) {
            throw AppError.conflict('Move current subscriptions to another plan before archiving');
          }
        }

        const fieldMap = {
          code: 'code',
          name: 'name',
          description: 'description',
          status: 'status',
          monthlyPriceCents: 'monthly_price_cents',
          annualPriceCents: 'annual_price_cents',
          currency: 'currency',
          trialDays: 'trial_days',
          displayOrder: 'display_order',
          entitlements: 'entitlements',
        };
        const fields = [];
        const values = [];
        for (const [key, column] of Object.entries(fieldMap)) {
          if (input[key] === undefined) continue;
          values.push(key === 'entitlements' ? JSON.stringify(input[key]) : input[key]);
          fields.push(`${column} = $${values.length}${key === 'entitlements' ? '::jsonb' : ''}`);
        }
        values.push(id);

        const [after] = await tx.unsafe(
          `UPDATE plans
           SET ${fields.join(', ')}, updated_at = NOW()
           WHERE id = $${values.length}
           RETURNING id, code, name, description, status, monthly_price_cents,
                     annual_price_cents, currency, trial_days, display_order,
                     entitlements, created_at, updated_at`,
          values,
        );
        await writePlatformAudit({
          actor,
          action: 'plan.updated',
          entityType: 'plan',
          entityId: id,
          before,
          after,
          sql: tx,
        });
        return after;
      });
      return successResponse(plan);
    } catch (error) {
      if (String(error?.code) === '23505') {
        throw AppError.conflict(`Plan code already exists: ${input.code}`);
      }
      throw error;
    }
  },
);