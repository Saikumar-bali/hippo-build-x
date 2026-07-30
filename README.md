# Hippo Build X

Multi-tenant construction management ERP built as a Next.js full-stack application with a dedicated BullMQ worker and PostgreSQL schema isolation.

## Technology

| Layer | Technology |
|---|---|
| Web and API | Next.js App Router (`/api/v1/*`) |
| UI | Ant Design 5 |
| Database | PostgreSQL / Neon, Drizzle metadata + explicit SQL |
| Isolation | `control_plane` + one forced-RLS schema per tenant |
| Jobs | BullMQ + Redis 7 |
| Mobile | Flutter |
| Object storage | S3/R2 compatible private storage |

## Repository structure

```text
apps/web       Next.js UI and API routes
apps/worker    Long-running BullMQ workers
apps/mobile    Flutter application
packages/db    Control-plane/tenant migrations and database contexts
packages/rbac  Permissions and scope enforcement
packages/shared Shared validation, errors, crypto and events
packages/notifications Provider adapters
packages/ai    Guarded AI provider abstraction
docs           Decisions, data model, RFCs and runbooks
```

## Locked tenant isolation

```text
control_plane
  tenants, platform_users, provisioning_jobs, tenant_channels,
  migration fleet records and Phase 12 entitlement tables

tenant_<immutableTenantUuid>
  users, roles, sessions, projects, units and all business data
```

New tenants use UUID-derived schemas, not slug-derived schemas. Access and refresh tokens contain `tenantId` but never schema names, database URLs or cached permission arrays. Every request reloads the authoritative data-source locator from `control_plane.tenants`.

Tenant queries execute inside a transaction with:

```sql
SET LOCAL search_path TO tenant_schema, pg_catalog;
SELECT set_config('app.tenant_id', '<tenant uuid>', true);
```

Every tenant table with `tenant_id` also uses forced RLS bound to both the request tenant and the schema owner. Runtime PostgreSQL credentials must be `NOSUPERUSER NOBYPASSRLS`.

See `docs/data-model.md` and DEC-007/DEC-010 in `docs/DECISIONS.md`.

## Prerequisites

- Node.js 20+
- pnpm 9.15+
- PostgreSQL 16+
- Redis 7+
- Flutter 3.27+ for mobile work

## Environment

```bash
cp .env.example .env
```

Minimum development values:

```bash
DATABASE_URL=postgres://hippo_runtime:password@localhost:5432/hippo
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-32-plus-characters
JWT_REFRESH_SECRET=replace-with-32-plus-characters
CHANNEL_CONFIG_KEY=replace-with-32-plus-characters
CHANNEL_CONFIG_KEY_VERSION=v1
COOKIE_SECURE=false
```

Do not use a Neon owner/admin connection as `DATABASE_URL` in production. Keep migration/operator credentials separate from normal web and worker credentials.

## Install and start

```bash
pnpm install

# UI + API
pnpm --filter @hippo/web dev

# Separate long-running provisioning/notification/report worker
pnpm --filter @hippo/worker dev
```

For local CI-style development without a worker only:

```bash
PROVISION_SYNC=true pnpm --filter @hippo/web dev
```

Synchronous provisioning is not the normal production topology.

## Database setup

```bash
# Apply explicit control-plane migrations
pnpm --filter @hippo/db db:migrate:control

# Seed platform admin and demonstration tenant through the real provisioner
pnpm --filter @hippo/db db:seed
```

The provisioner creates the immutable tenant schema, applies all tenant migrations, creates local and central migration ledgers, seeds roles and the initial administrator, initializes the encrypted channel vault and marks the tenant active.

Demo identities after seed:

```text
Platform: /platform/login
superadmin@hippo.example / SuperAdmin@12345

Tenant: /login
green-valley / admin@greenvalley.example / Admin@12345
```

Change all seeded credentials outside local development.

## Platform console

`/platform/tenants` provides:

- tenant and isolation status cards
- UUID-schema and data-location details
- durable provisioning progress
- migration version visibility
- safe retry for failed attempts
- masked channel-vault status

Tenant channel credentials are configured by Tenant Admin under `/admin/channels`. Secrets are encrypted with AES-256-GCM, authenticated with tenant/channel associated data, versioned for rotation and never returned in plaintext.

## Validation

```bash
# Unit and integration tests
pnpm test

# Locked PRD §5 database and HTTP proof
pnpm test:e2e:phase0

# Browser E2E
pnpm --filter @hippo/web test:e2e

# Quality gates
pnpm lint
pnpm build
```

`.github/workflows/multitenancy-ci.yml` runs PostgreSQL and Redis services, creates a non-superuser `NOBYPASSRLS` runtime role, executes hostile cross-schema tests, validates auth/RBAC/property behavior, builds the application and uploads Playwright evidence.

## Main APIs

```text
GET  /api/v1/health
GET  /api/v1/health/ready

POST /api/v1/platform/auth/login
GET  /api/v1/platform/auth/me
POST /api/v1/platform/auth/logout

GET|POST /api/v1/platform/tenants
GET      /api/v1/platform/tenants/:id
POST     /api/v1/platform/tenants/:id/retry-provisioning

POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password

GET|POST /api/v1/admin/users
GET|POST /api/v1/admin/roles
GET|PATCH /api/v1/admin/branding
GET|PATCH /api/v1/admin/channel-config
GET /api/v1/admin/audit
```

## Phase roadmap

The canonical phase sequence and exit gates live in `HIPPO_BUILD_X_END_TO_END_BLUEPRINT.md`. Super Admin ownership is fixed by DEC-009:

- Phase 0: tenant provisioning and isolation foundation
- Phase 1: platform login and tenant-owned configuration
- Phase 12: suspend/resume, plans/subscriptions, forced flags, health operations, export and deletion

## License

Proprietary. All rights reserved.
