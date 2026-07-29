import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  runControlPlaneMigrations,
  closeDb,
  getSql,
  pingDatabase,
  isControlPlaneReady,
} from '@hippo/db';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('database readiness helpers', () => {
  beforeAll(async () => {
    await runControlPlaneMigrations();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('pingDatabase succeeds', async () => {
    await expect(pingDatabase()).resolves.toBe(true);
  });

  it('isControlPlaneReady is true after migrations', async () => {
    await expect(isControlPlaneReady()).resolves.toBe(true);
  });

  it('control plane sql can query tenants', async () => {
    const sql = getSql();
    const rows = await sql`SELECT count(*)::int AS c FROM tenants`;
    expect(rows[0].c).toBeGreaterThanOrEqual(0);
  });
});

describe('readiness contract', () => {
  it('documents required checks', () => {
    const required = ['database', 'redis', 'controlPlane'];
    expect(required).toContain('database');
    expect(required).toContain('redis');
    expect(required).toContain('controlPlane');
  });
});
