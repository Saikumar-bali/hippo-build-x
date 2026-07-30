/**
 * Global application queries are intentionally disabled by PRD §5.
 *
 * Use:
 * - controlPlaneSql() for shared platform records
 * - tenantSql() for request-scoped tenant business records
 *
 * This module remains only to fail loudly if an old import survives a refactor.
 */
function disabled() {
  throw new Error(
    'Global database access is disabled; use controlPlaneSql() or tenantSql() with explicit context',
  );
}

export const getPool = disabled;
export const query = disabled;
export const queryOne = disabled;
export const transaction = disabled;
