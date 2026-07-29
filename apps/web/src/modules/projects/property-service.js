import { AppError, ErrorCode } from '@hippo/shared';
import { resolveScope } from '@hippo/rbac';

const UNIT_STATUSES = new Set(['available', 'reserved', 'sold', 'blocked']);
const LOCKED_FROM = {
  reserved: new Set(['available']),
  sold: new Set(['available', 'reserved']),
  blocked: new Set(['available']),
};

/**
 * Filter project list by RBAC scope.
 */
export function filterProjectsByScope(ctx, projects) {
  const scope = resolveScope(ctx);
  if (scope.type === 'global') return projects;
  if (scope.type === 'scoped' && scope.projectIds?.length) {
    return projects.filter((p) => scope.projectIds.includes(p.id));
  }
  return projects.filter((p) => p.created_by === ctx.userId);
}

export function assertProjectAccess(ctx, projectId) {
  const scope = resolveScope(ctx);
  if (scope.type === 'global') return;
  if (scope.type === 'scoped' && scope.projectIds?.includes(projectId)) return;
  throw new AppError(ErrorCode.FORBIDDEN, 'No access to this project', 403);
}

/**
 * Sync RBAC location row when a tower is created/updated.
 */
export async function syncLocationForTower(sql, { tenantId, projectId, tower, userId }) {
  const existing = await sql.unsafe(
    `SELECT id FROM locations WHERE project_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
    [projectId, tower.code],
  );
  if (existing[0]) {
    await sql.unsafe(
      `UPDATE locations SET name = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3`,
      [tower.name, userId || null, existing[0].id],
    );
    return existing[0].id;
  }
  const [loc] = await sql.unsafe(
    `INSERT INTO locations (tenant_id, project_id, name, code, status, created_by)
     VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id`,
    [tenantId, projectId, tower.name, tower.code, userId || null],
  );
  return loc.id;
}

/**
 * Bulk generate floors + units for a tower.
 */
export async function generateUnits(sql, {
  tenantId,
  projectId,
  towerId,
  categoryId,
  floorFrom,
  floorTo,
  unitsPerFloor,
  unitPrefix,
  userId,
}) {
  if (floorFrom > floorTo) throw AppError.validation('floorFrom must be <= floorTo');
  if (unitsPerFloor < 1 || unitsPerFloor > 50) {
    throw AppError.validation('unitsPerFloor must be 1-50');
  }

  const towers = await sql.unsafe(
    `SELECT id FROM towers WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
    [towerId, projectId],
  );
  if (!towers[0]) throw new AppError(ErrorCode.NOT_FOUND, 'Tower not found', 404);

  const created = [];
  for (let floorNum = floorFrom; floorNum <= floorTo; floorNum++) {
    let floorRows = await sql.unsafe(
      `SELECT id FROM floors WHERE tower_id = $1 AND floor_number = $2 AND deleted_at IS NULL`,
      [towerId, floorNum],
    );
    let floorId = floorRows[0]?.id;
    if (!floorId) {
      const [floor] = await sql.unsafe(
        `INSERT INTO floors (tenant_id, project_id, tower_id, floor_number, name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tenantId, projectId, towerId, floorNum, `Floor ${floorNum}`, userId || null],
      );
      floorId = floor.id;
    }

    for (let u = 1; u <= unitsPerFloor; u++) {
      const unitNumber = `${unitPrefix || ''}${floorNum}${String(u).padStart(2, '0')}`;
      try {
        const [unit] = await sql.unsafe(
          `INSERT INTO units (tenant_id, project_id, tower_id, floor_id, category_id, unit_number, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'available', $7)
           RETURNING *`,
          [tenantId, projectId, towerId, floorId, categoryId || null, unitNumber, userId || null],
        );
        created.push(unit);
      } catch (err) {
        if (String(err.message).includes('unique') || String(err.code) === '23505') {
          throw new AppError(
            ErrorCode.ALREADY_EXISTS,
            `Duplicate unit coordinate: ${unitNumber}`,
            409,
          );
        }
        throw err;
      }
    }
  }
  return created;
}

/**
 * Change unit status with transition rules + history.
 */
export async function changeUnitStatus(sql, {
  tenantId,
  unitId,
  toStatus,
  reason,
  actorId,
  correlationId,
}) {
  if (!UNIT_STATUSES.has(toStatus)) {
    throw AppError.validation(`Invalid status: ${toStatus}`);
  }
  const rows = await sql.unsafe(
    `SELECT * FROM units WHERE id = $1 AND deleted_at IS NULL`,
    [unitId],
  );
  const unit = rows[0];
  if (!unit) throw new AppError(ErrorCode.NOT_FOUND, 'Unit not found', 404);

  const from = unit.status;
  if (from === toStatus) return unit;

  // Cannot silently overwrite reserved/sold
  if ((from === 'reserved' || from === 'sold') && toStatus === 'available') {
    // allow release with explicit reason
    if (!reason) {
      throw AppError.validation(`Cannot change ${from} to available without a reason`);
    }
  }
  if (from === 'sold' && toStatus === 'reserved') {
    throw AppError.validation('Sold units cannot move to reserved');
  }
  if (from === 'sold' && toStatus === 'blocked') {
    throw AppError.validation('Sold units cannot be blocked');
  }

  const [updated] = await sql.unsafe(
    `UPDATE units SET status = $1, updated_at = NOW(), updated_by = $2
     WHERE id = $3 RETURNING *`,
    [toStatus, actorId || null, unitId],
  );
  await sql.unsafe(
    `INSERT INTO unit_status_history (tenant_id, unit_id, from_status, to_status, reason, actor_id, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, unitId, from, toStatus, reason || null, actorId || null, correlationId || null],
  );
  return updated;
}

/**
 * Detect cycle if adding predecessor -> successor edge.
 */
export async function assertNoDependencyCycle(sql, { projectId, predecessorId, successorId }) {
  if (predecessorId === successorId) {
    throw AppError.validation('Task cannot depend on itself');
  }
  // BFS from successor following successors — if we reach predecessor, cycle
  const edges = await sql.unsafe(
    `SELECT predecessor_id, successor_id FROM task_dependencies WHERE project_id = $1`,
    [projectId],
  );
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.predecessor_id)) adj.set(e.predecessor_id, []);
    adj.get(e.predecessor_id).push(e.successor_id);
  }
  if (!adj.has(predecessorId)) adj.set(predecessorId, []);
  adj.get(predecessorId).push(successorId);

  const seen = new Set();
  const queue = [successorId];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === predecessorId) {
      throw AppError.validation('Task dependency would create a cycle');
    }
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) || []) queue.push(next);
  }
}

/**
 * Create a new immutable drawing version.
 */
export async function createDrawingVersion(sql, {
  tenantId,
  projectId,
  drawingNumber,
  title,
  fileUrl,
  notes,
  userId,
}) {
  const latest = await sql.unsafe(
    `SELECT id, version FROM drawings
     WHERE project_id = $1 AND drawing_number = $2 AND deleted_at IS NULL
     ORDER BY version DESC LIMIT 1`,
    [projectId, drawingNumber],
  );
  const version = latest[0] ? latest[0].version + 1 : 1;
  const supersedesId = latest[0]?.id || null;
  const [row] = await sql.unsafe(
    `INSERT INTO drawings (tenant_id, project_id, title, drawing_number, version, file_url, notes, supersedes_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      tenantId,
      projectId,
      title,
      drawingNumber,
      version,
      fileUrl || null,
      notes || null,
      supersedesId,
      userId || null,
    ],
  );
  return row;
}

export { UNIT_STATUSES, LOCKED_FROM };
