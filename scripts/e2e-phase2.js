#!/usr/bin/env node
/**
 * Phase 2 E2E: login → project structure → generate units → status change
 * Usage: BASE_URL=http://localhost:3000 node scripts/e2e-phase2.js
 */
const base = process.env.BASE_URL || 'http://localhost:3000';

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  const results = [];
  const pass = (n, d) => {
    results.push({ n, ok: true, d });
    console.log('PASS', n, d || '');
  };
  const fail = (n, d) => {
    results.push({ n, ok: false, d });
    console.error('FAIL', n, d || '');
  };

  const loginRes = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      slug: 'green-valley',
      email: 'admin@greenvalley.example',
      password: 'Admin@12345',
    }),
  });
  const loginJson = await loginRes.json();
  const cookies = parseCookies(loginRes);
  if (loginRes.ok && cookies.includes('access_token')) pass('login', loginJson.data?.user?.email);
  else fail('login', JSON.stringify(loginJson));

  const headers = { 'content-type': 'application/json', cookie: cookies };

  let projects = await (await fetch(`${base}/api/v1/projects`, { headers: { cookie: cookies } })).json();
  let project = (projects.data || []).find((p) => p.code === 'GVR');
  if (!project) {
    const created = await fetch(`${base}/api/v1/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Green Valley Residency', code: 'GVR' }),
    });
    const createdJson = await created.json();
    project = createdJson.data;
  }
  if (project?.id) pass('project', project.code);
  else fail('project', JSON.stringify(projects));

  const structureRes = await fetch(`${base}/api/v1/projects/${project.id}/structure`, {
    headers: { cookie: cookies },
  });
  let structure = await structureRes.json();
  let tower = (structure.data?.towers || [])[0];
  if (!tower) {
    await fetch(`${base}/api/v1/projects/${project.id}/blocks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Block A', code: 'BLK-A' }),
    });
    const tRes = await fetch(`${base}/api/v1/projects/${project.id}/towers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Tower A', code: 'TOWER-A', floorsPlanned: 10 }),
    });
    const tJson = await tRes.json();
    tower = tJson.data;
  }
  if (tower?.id) pass('tower', tower.code);
  else fail('tower', JSON.stringify(structure));

  structure = await (
    await fetch(`${base}/api/v1/projects/${project.id}/structure`, { headers: { cookie: cookies } })
  ).json();
  let cat = (structure.data?.categories || [])[0];
  if (!cat) {
    const cRes = await fetch(`${base}/api/v1/projects/${project.id}/categories`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '2 BHK', code: '2BHK', bedrooms: 2 }),
    });
    cat = (await cRes.json()).data;
  }

  const genRes = await fetch(`${base}/api/v1/projects/${project.id}/units`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      towerId: tower.id,
      categoryId: cat?.id,
      floorFrom: 1,
      floorTo: 2,
      unitsPerFloor: 2,
      unitPrefix: `E${Date.now().toString().slice(-4)}`,
    }),
  });
  const genText = await genRes.text();
  let genJson;
  try {
    genJson = JSON.parse(genText);
  } catch {
    fail('generate-units', `non-json ${genRes.status}: ${genText.slice(0, 200)}`);
    genJson = {};
  }
  if (genRes.ok && genJson.data?.count > 0) pass('generate-units', `${genJson.data.count} units`);
  else if (!results.some((r) => r.n === 'generate-units' && !r.ok)) {
    fail('generate-units', JSON.stringify(genJson));
  }

  const unitId = genJson.data?.units?.[0]?.id;
  if (!unitId) {
    fail('unit-status', 'no unit id');
    fail('status-history', 'skipped');
  } else {
    const statusRes = await fetch(`${base}/api/v1/units/${unitId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'reserved', reason: 'e2e booking hold' }),
    });
    const statusJson = await statusRes.json();
    if (statusRes.ok && statusJson.data?.status === 'reserved') pass('unit-status', 'reserved');
    else fail('unit-status', JSON.stringify(statusJson));

    const unitGet = await fetch(`${base}/api/v1/units/${unitId}`, { headers: { cookie: cookies } });
    const unitJson = await unitGet.json();
    if ((unitJson.data?.history || []).length > 0) {
      pass('status-history', `${unitJson.data.history.length}`);
    } else {
      fail('status-history', JSON.stringify(unitJson));
    }
  }

  const taskRes = await fetch(`${base}/api/v1/projects/${project.id}/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `E2E Task ${Date.now()}`, startDate: '2026-01-01', endDate: '2026-01-15' }),
  });
  const taskJson = await taskRes.json();
  if (taskRes.ok) pass('task', taskJson.data?.id);
  else fail('task', JSON.stringify(taskJson));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
