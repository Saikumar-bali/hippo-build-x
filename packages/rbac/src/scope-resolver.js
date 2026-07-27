/**
 * Resolve the data scope filter based on the user's assignments.
 * This determines what data a user can see/modify.
 */
export function resolveScope(ctx) {
  // Admin users see everything
  if (ctx.roles.includes('admin')) {
    return { type: 'global', field: '', value: null };
  }

  // If user is assigned to a specific project, scope to that project
  if (ctx.projectId) {
    return { type: 'project', field: 'project_id', value: ctx.projectId };
  }

  // If user is assigned to a specific location, scope to that location
  if (ctx.locationId) {
    return { type: 'location', field: 'location_id', value: ctx.locationId };
  }

  // Default: scope to own data only
  return { type: 'own', field: 'created_by', value: ctx.userId };
}

/**
 * Check if the user can access a specific record based on scope.
 */
export function canAccessRecord(ctx, record) {
  const scope = resolveScope(ctx);

  if (scope.type === 'global') {
    return true;
  }

  if (scope.field && scope.value) {
    return record[scope.field] === scope.value;
  }

  return false;
}
