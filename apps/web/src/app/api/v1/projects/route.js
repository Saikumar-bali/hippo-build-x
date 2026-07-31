import { successResponse, parseBody, withApiHandler, tenantSql } from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { AppError } from '@hippo/shared';
import { Permission } from '@hippo/rbac';
import { filterProjectsByScope } from '@/modules/projects/property-service.js';
import { enforceCountQuota } from '@/modules/auth/tenant-quota-service.js';

export const GET = withApiHandler(
  { auth: true, permission: Permission.PROJECT_READ },
  async () => {
    const ctx = requireAuthContext();
    const sql = tenantSql();
    const projects = await sql.unsafe(
      `SELECT * FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [ctx.tenantId],
    );
    return successResponse(filterProjectsByScope(ctx, projects));
  },
);

export const POST = withApiHandler(
  {
    auth: true,
    permission: Permission.PROJECT_CREATE,
    audit: { action: 'create', entityType: 'project' },
  },
  async (request) => {
    const ctx = requireAuthContext();
    const body = await parseBody(request);
    const { name, code, description, start_date, end_date, budget, address, city, state } = body;
    if (!name || !code) throw AppError.validation('Name and code are required');

    const sql = tenantSql();
    try {
      const project = await sql.begin(async (tx) => {
        await enforceCountQuota(tx, ctx, 'projects');
        const [created] = await tx.unsafe(
          `INSERT INTO projects (
             tenant_id, name, code, description, start_date, end_date, budget, address, city, state, created_by, updated_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
           RETURNING *`,
          [
            ctx.tenantId,
            name,
            code,
            description || null,
            start_date || null,
            end_date || null,
            budget ?? null,
            address || null,
            city || null,
            state || null,
            ctx.userId,
          ],
        );
        return created;
      });
      return successResponse(project, {}, 201);
    } catch (err) {
      if (String(err.code) === '23505') {
        throw AppError.validation('Project code already exists');
      }
      throw err;
    }
  },
);