import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { AppError } from '@hippo/shared';
import {
  isCurrentSubscriptionStatus,
  normalizeSubscriptionInput,
  requireSuperAdmin,
  validateSubscriptionWindow,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

export const PATCH = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const input = normalizeSubscriptionInput(await parseBody(request), { partial: true });
    if (input.tenantId !== undefined) {
      throw AppError.validation('A subscription cannot be moved to another company');
    }
    const sql = controlPlaneSql();

    const subscription = await sql.begin(async (tx) => {
      const [before] = await tx`
        SELECT id, tenant_id, plan_id, status, starts_at, ends_at, notes, cancelled_at
        FROM subscriptions WHERE id = ${id} FOR UPDATE
      `;
      if (!before) throw AppError.notFound('Subscription', id);
      if (!Object.keys(input).length) throw AppError.validation('No subscription fields to update');

      const nextStatus = input.status || before.status;
      const nextStartsAt = input.startsAt || before.starts_at;
      const nextEndsAt = input.endsAt === undefined ? before.ends_at : input.endsAt;
      validateSubscriptionWindow({
        status: nextStatus,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
      });

      const nextPlanId = input.planId || before.plan_id;
      const [plan] = await tx`
        SELECT id, status FROM plans WHERE id = ${nextPlanId} FOR SHARE
      `;
      if (!plan) throw AppError.notFound('Plan', nextPlanId);
      if (plan.status !== 'active') throw AppError.conflict('Archived plans cannot be assigned');

      let replaced = null;
      if (isCurrentSubscriptionStatus(nextStatus)) {
        [replaced] = await tx`
          SELECT id, plan_id, status, starts_at, ends_at, notes
          FROM subscriptions
          WHERE tenant_id = ${before.tenant_id}
            AND id <> ${id}
            AND status IN ('active', 'trial', 'paused')
            AND starts_at <= NOW()
            AND (ends_at IS NULL OR ends_at > NOW())
          ORDER BY starts_at DESC
          LIMIT 1
          FOR UPDATE
        `;
        if (replaced) {
          await tx`
            UPDATE subscriptions
            SET status = 'cancelled',
                ends_at = LEAST(COALESCE(ends_at, NOW()), NOW()),
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE id = ${replaced.id}
          `;
        }
      }

      const fields = [];
      const values = [];
      const add = (column, value) => {
        values.push(value);
        fields.push(`${column} = $${values.length}`);
      };
      if (input.status !== undefined) add('status', input.status);
      if (input.startsAt !== undefined) add('starts_at', input.startsAt);
      if (input.endsAt !== undefined) add('ends_at', input.endsAt);
      if (input.notes !== undefined) add('notes', input.notes);
      if (input.planId !== undefined) add('plan_id', input.planId);
      if (['cancelled', 'expired'].includes(input.status)) {
        fields.push('cancelled_at = COALESCE(cancelled_at, NOW())');
        if (input.endsAt === undefined) fields.push('ends_at = COALESCE(ends_at, NOW())');
      }
      if (isCurrentSubscriptionStatus(nextStatus)) {
        fields.push('cancelled_at = NULL');
      }
      if (!fields.length) throw AppError.validation('No subscription fields to update');
      values.push(id);

      const [after] = await tx.unsafe(
        `UPDATE subscriptions
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length}
         RETURNING id, tenant_id, plan_id, status, starts_at, ends_at, notes,
                   cancelled_at, created_at, updated_at`,
        values,
      );

      await writePlatformAudit({
        actor,
        action: 'subscription.updated',
        entityType: 'subscription',
        entityId: id,
        tenantId: before.tenant_id,
        before: replaced ? { subscription: before, replaced } : before,
        after,
        sql: tx,
      });
      return after;
    });

    return successResponse(subscription);
  },
);