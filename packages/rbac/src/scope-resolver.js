/**
 * Resolve the data scope filter based on the user's assignments.
 */
export function resolveScope(ctx) {
  const roles = (ctx.roles || []).map((r) => String(r).toLowerCase());
  if (roles.includes('administrator') || roles.includes('admin')) {
    return { type: 'global', projectIds: null, locationIds: null };
  }

  const projectIds = ctx.projectIds || [];
  const locationIds = ctx.locationIds || [];

  if (projectIds.length || locationIds.length) {
    return { type: 'scoped', projectIds, locationIds };
  }

  return { type: 'own', field: 'created_by', value: ctx.userId };
}

/**
 * @param {object} ctx
 * @param {{ project_id?: string, location_id?: string, created_by?: string }} record
 */
export function canAccessRecord(ctx, record) {
  const scope = resolveScope(ctx);
  if (scope.type === 'global') return true;

  if (scope.type === 'scoped') {
    if (record.project_id && scope.projectIds?.length) {
      if (!scope.projectIds.includes(record.project_id)) return false;
    }
    if (record.location_id && scope.locationIds?.length) {
      if (!scope.locationIds.includes(record.location_id)) return false;
    }
    return true;
  }

  if (scope.type === 'own') {
    return record.created_by === scope.value;
  }

  return false;
}

/**
 * Assert user can access a project id.
 */
export function enforceProjectAccess(ctx, projectId) {
  const scope = resolveScope(ctx);
  if (scope.type === 'global') return;
  if (scope.type === 'scoped' && scope.projectIds?.includes(projectId)) return;
  throw new Error(`No access to project ${projectId}`);
}
