import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError, ErrorCode } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import {
  assertProjectAccess,
  assertNoDependencyCycle,
} from '@/modules/projects/property-service.js';

/** POST /api/v1/tasks/:id/dependencies — :id is the successor task */
export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.TASK_UPDATE,
    audit: { action: 'create', entityType: 'task_dependency' },
  },
  async (request, context) => {
    const ctx = requireAuthContext();
    const { id: successorId } = await context.params;
    const body = await parseBody(request);
    const predecessorId = body.predecessorId;
    if (!predecessorId) throw AppError.validation('predecessorId required');

    const sql = tenantSql();
    const tasks = await sql.unsafe(
      `SELECT id, project_id FROM tasks WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [[predecessorId, successorId]],
    );
    if (tasks.length !== 2) throw new AppError(ErrorCode.NOT_FOUND, 'Task not found', 404);
    const projectId = tasks[0].project_id;
    assertProjectAccess(ctx, projectId);
    await assertNoDependencyCycle(sql, { projectId, predecessorId, successorId });

    try {
      const [row] = await sql.unsafe(
        `INSERT INTO task_dependencies (tenant_id, project_id, predecessor_id, successor_id, dependency_type)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.tenantId, projectId, predecessorId, successorId, body.dependencyType || 'FS'],
      );
      return successResponse(row, {}, 201);
    } catch (err) {
      if (String(err.code) === '23505') throw AppError.validation('Dependency already exists');
      throw err;
    }
  },
);
