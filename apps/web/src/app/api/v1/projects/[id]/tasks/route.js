import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { assertProjectAccess } from '@/modules/projects/property-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.TASK_READ },
  async (_request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const sql = tenantSql();
    const milestones = await sql.unsafe(
      `SELECT * FROM milestones WHERE project_id = $1 AND deleted_at IS NULL ORDER BY sort_order, start_date`,
      [id],
    );
    const tasks = await sql.unsafe(
      `SELECT * FROM tasks WHERE project_id = $1 AND deleted_at IS NULL ORDER BY start_date NULLS LAST, name`,
      [id],
    );
    const deps = await sql.unsafe(
      `SELECT * FROM task_dependencies WHERE project_id = $1`,
      [id],
    );
    return successResponse({ milestones, tasks, dependencies: deps });
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.TASK_CREATE,
    audit: { action: 'create', entityType: 'task' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id } = await context.params;
    assertProjectAccess(ctx, id);
    const body = await parseBody(request);
    const sql = tenantSql();

    if (body.type === 'milestone') {
      if (!body.name) throw AppError.validation('name required');
      const [row] = await sql.unsafe(
        `INSERT INTO milestones (tenant_id, project_id, name, code, start_date, end_date, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          ctx.tenantId,
          id,
          body.name,
          body.code || null,
          body.startDate || null,
          body.endDate || null,
          body.sortOrder ?? 0,
          ctx.userId,
        ],
      );
      return successResponse(row, {}, 201);
    }

    if (!body.name) throw AppError.validation('name required');
    const [row] = await sql.unsafe(
      `INSERT INTO tasks (tenant_id, project_id, milestone_id, name, description, start_date, end_date, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        ctx.tenantId,
        id,
        body.milestoneId || null,
        body.name,
        body.description || null,
        body.startDate || null,
        body.endDate || null,
        body.status || 'todo',
        ctx.userId,
      ],
    );
    return successResponse(row, {}, 201);
  },
);
