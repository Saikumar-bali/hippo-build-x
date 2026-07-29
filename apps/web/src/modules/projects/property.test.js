import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runControlPlaneMigrations,
  provisionTenantSchema,
  rollbackTenantProvisioning,
  toSchemaName,
  closeDb,
  getSql,
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

describe.skipIf(!hasDb)('Phase 2 property rules', () => {
  const stamp = Date.now();
  const slug = `p2-${stamp}`;
  const schemaName = toSchemaName(slug);
  let tenantId;
  let projectId;
  let towerId;
  let categoryId;

  beforeAll(async () => {
    await runControlPlaneMigrations();
    const sql = getSql();
    const [tenant] = await sql`
      INSERT INTO tenants (name, slug, schema_name, status)
      VALUES (${'P2 Tenant'}, ${slug}, ${schemaName}, ${TENANT_STATUS.PROVISIONING})
      RETURNING id
    `;
    tenantId = tenant.id;
    await provisionTenantSchema(tenantId, schemaName, {
      adminEmail: `admin@${slug}.test`,
      password: 'Admin@12345',
    });
    const tsql = createTenantSql(schemaName);
    const [project] = await tsql.unsafe(
      `INSERT INTO projects (tenant_id, name, code) VALUES ($1,'Demo','DEMO') RETURNING id`,
      [tenantId],
    );
    projectId = project.id;
    const [tower] = await tsql.unsafe(
      `INSERT INTO towers (tenant_id, project_id, name, code) VALUES ($1,$2,'T1','T1') RETURNING id`,
      [tenantId, projectId],
    );
    towerId = tower.id;
    const [cat] = await tsql.unsafe(
      `INSERT INTO unit_categories (tenant_id, project_id, name, code)
       VALUES ($1,$2,'2BHK','2BHK') RETURNING id`,
      [tenantId, projectId],
    );
    categoryId = cat.id;
  }, 120000);

  afterAll(async () => {
    try {
      if (tenantId) {
        await rollbackTenantProvisioning(schemaName, tenantId);
        await getSql()`DELETE FROM tenants WHERE id = ${tenantId}`;
      }
    } finally {
      await closeDb();
    }
  });

  it('rejects duplicate unit coordinates', async () => {
    const sql = createTenantSql(schemaName);
    await generateUnits(sql, {
      tenantId,
      projectId,
      towerId,
      categoryId,
      floorFrom: 1,
      floorTo: 1,
      unitsPerFloor: 2,
      unitPrefix: 'X',
    });
    await expect(
      generateUnits(sql, {
        tenantId,
        projectId,
        towerId,
        categoryId,
        floorFrom: 1,
        floorTo: 1,
        unitsPerFloor: 2,
        unitPrefix: 'X',
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('records status history and blocks sold→reserved', async () => {
    const sql = createTenantSql(schemaName);
    const [unit] = await sql.unsafe(
      `SELECT id FROM units WHERE project_id = $1 LIMIT 1`,
      [projectId],
    );
    await changeUnitStatus(sql, {
      tenantId,
      unitId: unit.id,
      toStatus: 'reserved',
      actorId: null,
    });
    await changeUnitStatus(sql, {
      tenantId,
      unitId: unit.id,
      toStatus: 'sold',
      actorId: null,
    });
    await expect(
      changeUnitStatus(sql, {
        tenantId,
        unitId: unit.id,
        toStatus: 'reserved',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    const hist = await sql.unsafe(
      `SELECT * FROM unit_status_history WHERE unit_id = $1 ORDER BY created_at`,
      [unit.id],
    );
    expect(hist.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects task dependency cycles', async () => {
    const sql = createTenantSql(schemaName);
    const [a] = await sql.unsafe(
      `INSERT INTO tasks (tenant_id, project_id, name) VALUES ($1,$2,'A') RETURNING id`,
      [tenantId, projectId],
    );
    const [b] = await sql.unsafe(
      `INSERT INTO tasks (tenant_id, project_id, name) VALUES ($1,$2,'B') RETURNING id`,
      [tenantId, projectId],
    );
    await sql.unsafe(
      `INSERT INTO task_dependencies (tenant_id, project_id, predecessor_id, successor_id)
       VALUES ($1,$2,$3,$4)`,
      [tenantId, projectId, a.id, b.id],
    );
    await expect(
      assertNoDependencyCycle(sql, {
        projectId,
        predecessorId: b.id,
        successorId: a.id,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates immutable drawing versions', async () => {
    const sql = createTenantSql(schemaName);
    const v1 = await createDrawingVersion(sql, {
      tenantId,
      projectId,
      drawingNumber: 'A-101',
      title: 'Plan',
      fileUrl: 's3://v1',
    });
    const v2 = await createDrawingVersion(sql, {
      tenantId,
      projectId,
      drawingNumber: 'A-101',
      title: 'Plan rev',
      fileUrl: 's3://v2',
    });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.supersedes_id).toBe(v1.id);
    const still = await sql.unsafe(`SELECT version, file_url FROM drawings WHERE id = $1`, [
      v1.id,
    ]);
    expect(still[0].file_url).toBe('s3://v1');
  });

  it('scopes projects for non-admin', () => {
    const projects = [
      { id: 'p1', created_by: 'u1' },
      { id: 'p2', created_by: 'u2' },
    ];
    const filtered = filterProjectsByScope(
      { roles: ['Site Engineer'], projectIds: ['p1'], locationIds: [], userId: 'u9' },
      projects,
    );
    expect(filtered.map((p) => p.id)).toEqual(['p1']);
  });
});
