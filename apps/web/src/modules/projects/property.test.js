import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runControlPlaneMigrations,
  provisionTenantSchema,
  rollbackTenantProvisioning,
  toTenantSchemaName,
  closeDb,
  createControlPlaneSql,
  createTenantSql,
  TENANT_STATUS,
} from '@hippo/db';
import {
  generateUnits,
  changeUnitStatus,
  assertNoDependencyCycle,
  createDrawingVersion,
  filterProjectsByScope,
} from './property-service.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Phase 2 property rules in isolated schema', () => {
  const tenantId = crypto.randomUUID();
  const slug = `p2-${Date.now()}`;
  const schemaName = toTenantSchemaName(tenantId);
  let projectId;
  let towerId;
  let categoryId;

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const cp = createControlPlaneSql();
    await cp`
      INSERT INTO tenants (id, name, slug, schema_name, status, isolation_mode)
      VALUES (${tenantId}, 'P2 Tenant', ${slug}, ${schemaName},
              ${TENANT_STATUS.PROVISIONING}, 'shared_schema')
    `;
    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      password: 'Admin@12345',
    });

    const sql = createTenantSql(schemaName, tenantId);
    const [project] = await sql.unsafe(
      `INSERT INTO projects (tenant_id, name, code) VALUES ($1, 'Demo', 'DEMO') RETURNING id`,
      [tenantId],
    );
    projectId = project.id;
    const [tower] = await sql.unsafe(
      `INSERT INTO towers (tenant_id, project_id, name, code)
       VALUES ($1, $2, 'T1', 'T1') RETURNING id`,
      [tenantId, projectId],
    );
    towerId = tower.id;
    const [category] = await sql.unsafe(
      `INSERT INTO unit_categories (tenant_id, project_id, name, code)
       VALUES ($1, $2, '2BHK', '2BHK') RETURNING id`,
      [tenantId, projectId],
    );
    categoryId = category.id;
  }, 120000);

  afterAll(async () => {
    try {
      await rollbackTenantProvisioning(schemaName, tenantId);
      const cp = createControlPlaneSql();
      await cp`DELETE FROM tenant_channels WHERE tenant_id = ${tenantId}`;
      await cp`DELETE FROM tenants WHERE id = ${tenantId}`;
    } finally {
      await closeDb();
    }
  });

  it('rejects duplicate unit coordinates', async () => {
    const sql = createTenantSql(schemaName, tenantId);
    const input = {
      tenantId,
      projectId,
      towerId,
      categoryId,
      floorFrom: 1,
      floorTo: 1,
      unitsPerFloor: 2,
      unitPrefix: 'X',
    };
    await generateUnits(sql, input);
    await expect(generateUnits(sql, input)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('records status history and blocks sold to reserved', async () => {
    const sql = createTenantSql(schemaName, tenantId);
    const [unit] = await sql.unsafe(`SELECT id FROM units WHERE project_id = $1 LIMIT 1`, [projectId]);
    await changeUnitStatus(sql, { tenantId, unitId: unit.id, toStatus: 'reserved', actorId: null });
    await changeUnitStatus(sql, { tenantId, unitId: unit.id, toStatus: 'sold', actorId: null });
    await expect(
      changeUnitStatus(sql, { tenantId, unitId: unit.id, toStatus: 'reserved' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const history = await sql.unsafe(
      `SELECT * FROM unit_status_history WHERE unit_id = $1 ORDER BY created_at`,
      [unit.id],
    );
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects task dependency cycles', async () => {
    const sql = createTenantSql(schemaName, tenantId);
    const [a] = await sql.unsafe(
      `INSERT INTO tasks (tenant_id, project_id, name) VALUES ($1, $2, 'A') RETURNING id`,
      [tenantId, projectId],
    );
    const [b] = await sql.unsafe(
      `INSERT INTO tasks (tenant_id, project_id, name) VALUES ($1, $2, 'B') RETURNING id`,
      [tenantId, projectId],
    );
    await sql.unsafe(
      `INSERT INTO task_dependencies (tenant_id, project_id, predecessor_id, successor_id)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, projectId, a.id, b.id],
    );
    await expect(
      assertNoDependencyCycle(sql, { projectId, predecessorId: b.id, successorId: a.id }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates immutable drawing versions', async () => {
    const sql = createTenantSql(schemaName, tenantId);
    const first = await createDrawingVersion(sql, {
      tenantId,
      projectId,
      drawingNumber: 'A-101',
      title: 'Plan',
      fileUrl: 's3://v1',
    });
    const second = await createDrawingVersion(sql, {
      tenantId,
      projectId,
      drawingNumber: 'A-101',
      title: 'Plan rev',
      fileUrl: 's3://v2',
    });
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.supersedes_id).toBe(first.id);
    const [still] = await sql.unsafe(`SELECT file_url FROM drawings WHERE id = $1`, [first.id]);
    expect(still.file_url).toBe('s3://v1');
  });

  it('scopes project lists for non-admin users', () => {
    const filtered = filterProjectsByScope(
      { roles: ['Site Engineer'], projectIds: ['p1'], locationIds: [], userId: 'u9' },
      [
        { id: 'p1', created_by: 'u1' },
        { id: 'p2', created_by: 'u2' },
      ],
    );
    expect(filtered.map((project) => project.id)).toEqual(['p1']);
  });
});
