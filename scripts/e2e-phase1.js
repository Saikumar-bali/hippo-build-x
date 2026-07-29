#!/usr/bin/env node
/**
 * Phase 1 E2E: login → admin create Meera-like user → scope → logout
 * Usage: BASE_URL=http://localhost:3000 node scripts/e2e-phase1.js
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

  // Login
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
  if (loginRes.ok && loginJson.success && cookies.includes('access_token')) {
    pass('login', loginJson.data?.user?.email);
  } else {
    fail('login', JSON.stringify(loginJson));
  }

  const meRes = await fetch(`${base}/api/v1/auth/me`, { headers: { cookie: cookies } });
  const meJson = await meRes.json();
  if (meRes.ok && meJson.data?.roles?.length) pass('me', meJson.data.roles.join(','));
  else fail('me', JSON.stringify(meJson));

  const rolesRes = await fetch(`${base}/api/v1/admin/roles`, { headers: { cookie: cookies } });
  const rolesJson = await rolesRes.json();
  const siteRole = (rolesJson.data || []).find((r) => r.name === 'Site Engineer');

  const scopeRes = await fetch(`${base}/api/v1/admin/scope-options`, {
    headers: { cookie: cookies },
  });
  const scopeJson = await scopeRes.json();
  const projectId = scopeJson.data?.projects?.[0]?.id;
  const locationId = scopeJson.data?.locations?.[0]?.id;

  const email = `e2e.meera.${Date.now()}@greenvalley.example`;
  const createRes = await fetch(`${base}/api/v1/admin/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookies },
    body: JSON.stringify({
      name: 'E2E Meera',
      email,
      password: 'Meera@12345',
      roleId: siteRole?.id,
      projectId,
      locationId,
    }),
  });
  const createJson = await createRes.json();
  if (createRes.ok && createJson.success) pass('create-user', createJson.data?.id);
  else fail('create-user', JSON.stringify(createJson));

  const auditRes = await fetch(`${base}/api/v1/admin/audit?entityType=user`, {
    headers: { cookie: cookies },
  });
  const auditJson = await auditRes.json();
  if (auditRes.ok && (auditJson.data || []).length > 0) pass('audit', `${auditJson.data.length} rows`);
  else fail('audit', JSON.stringify(auditJson));

  const logoutRes = await fetch(`${base}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { cookie: cookies },
  });
  if (logoutRes.ok) pass('logout');
  else fail('logout');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
