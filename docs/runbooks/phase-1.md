# Phase 1 — Identity, RBAC, Tenant Admin

## Seeded demo login

After `pnpm --filter @hippo/db db:seed`:

### Platform super admin (creates tenants)

| Field | Value |
|---|---|
| UI | `/platform/login` |
| Email | `superadmin@hippo.example` |
| Password | `SuperAdmin@12345` |

### Tenant admin (Green Valley)

| Field | Value |
|---|---|
| UI | `/login` |
| Tenant slug | `green-valley` |
| Admin email | `admin@greenvalley.example` |
| Admin password | `Admin@12345` |
| Meera email | `meera@greenvalley.example` |
| Meera password | `Meera@12345` |

Meera is seeded as Site Engineer scoped to project `GVR` / location `TOWER-A`.

## Local flow

```bash
pnpm install
pnpm --filter @hippo/db db:migrate:control
pnpm --filter @hippo/db db:seed
pnpm --filter @hippo/web dev
```

- Tenant admin: http://localhost:3000/login
- Super admin (create tenants): http://localhost:3000/platform/login

## API smoke

```bash
# Platform super admin login + create tenant
curl -c platform.txt -X POST http://localhost:3000/api/v1/platform/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"superadmin@hippo.example","password":"SuperAdmin@12345"}'

curl -b platform.txt -X POST http://localhost:3000/api/v1/platform/tenants \
  -H 'content-type: application/json' \
  -d '{"name":"Acme","slug":"acme","adminEmail":"admin@acme.example"}'

# Tenant login (sets HttpOnly cookies)
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"slug":"green-valley","email":"admin@greenvalley.example","password":"Admin@12345"}'

curl -b cookies.txt http://localhost:3000/api/v1/auth/me
```

## E2E script

```bash
$env:BASE_URL='http://localhost:3000'
node scripts/e2e-phase1.js
```

## Mobile token strategy

Same auth endpoints. Send `Authorization: Bearer <access_token>` and refresh via `x-refresh-token` or body when cookies are unavailable. Store tokens in Flutter secure storage (Phase 11 UI).

## Super Admin phase map (DEC-009)

| Now (Phase 0–1) | Later (Phase 12) |
|---|---|
| Provision tenants | Suspend / resume tenant |
| Platform login + create/list UI | Platform-forced module kill-switches |
| Tenant-owned feature flags | Plans & subscriptions |
| | Cross-tenant health / ops |
| | Export / delete / revoke sessions |

Canonical sources: PRD §3.1, Blueprint Super Admin map, `docs/DECISIONS.md` DEC-009.
