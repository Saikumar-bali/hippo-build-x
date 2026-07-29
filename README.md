# Construction ERP

Multi-tenant construction management platform built with Next.js as a full-stack application.

## Tech Stack

| Layer | Technology |
|---|---|
| **Full-Stack** | Next.js (App Router) — frontend UI + backend API routes |
| **UI** | Ant Design 5 |
| **State** | TanStack Query, Zustand |
| **Mobile** | Flutter, Riverpod, GoRouter |
| **Database** | PostgreSQL, Drizzle ORM (schema-per-tenant) |
| **Background Jobs** | BullMQ + Redis |
| **Notifications** | Email, SMS, WhatsApp adapters |
| **AI** | Provider-agnostic abstraction with guardrails |

## Repository Structure

```
hippo-build-x/
├── apps/
│   ├── web/          # Next.js full-stack (UI + API routes)
│   ├── worker/       # BullMQ background worker
│   └── mobile/       # Flutter mobile app
├── packages/
│   ├── db/           # Drizzle schemas, migrations, tenant provisioning
│   ├── shared/       # DTOs, types, enums, events, validation
│   ├── rbac/         # Permissions, guards, scope resolvers
│   ├── notifications/# Email, SMS, WhatsApp adapters and templates
│   └── ai/           # AI provider abstraction, guardrails
├── docs/             # Architecture, RFCs, runbooks, decisions
└── .github/          # CI/CD workflows, CODEOWNERS, PR/issue templates
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16+
- Redis 7+ (BullMQ requires Redis ≥ 5; use Redis 7 locally or in CI)
- Flutter 3.27+ (for mobile)

### Install Dependencies

```bash
pnpm install
```

### Environment Setup

Copy `.env.example` to `.env` (and `apps/web/.env.local` as needed):

```bash
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/hippo

# Redis (for background jobs)
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here
COOKIE_SECURE=false
CHANNEL_CONFIG_KEY=dev-channel-config-key-change-me!!
PLATFORM_API_KEY=dev-platform-api-key-change-me

# CORS
CORS_ORIGIN=http://localhost:3000
```

### Development

```bash
# Start Next.js (frontend + backend)
pnpm --filter @hippo/web dev

# Start worker (tenant provisioning, notifications, reports)
pnpm --filter @hippo/worker dev

# Mobile
cd apps/mobile && flutter run
```

### Database

```bash
# Apply control-plane schema
pnpm --filter @hippo/db db:migrate:control

# Seed demo tenant (Green Valley Developers)
pnpm --filter @hippo/db db:seed

# Open Drizzle Studio
pnpm --filter @hippo/db db:studio
```

### API Routes

All backend logic lives in Next.js API routes under `/api/v1`:

```
GET  /api/v1/health
GET  /api/v1/health/ready
POST /api/v1/platform/tenants
GET  /api/v1/platform/tenants/:id
POST /api/v1/platform/tenants/:id/retry-provisioning
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
GET|POST /api/v1/admin/users
GET|POST /api/v1/admin/roles
GET|PATCH /api/v1/admin/branding
GET|PATCH /api/v1/admin/channel-config
GET  /api/v1/admin/audit
```

Demo logins after seed (see [docs/runbooks/phase-1.md](docs/runbooks/phase-1.md) and [docs/runbooks/phase-2.md](docs/runbooks/phase-2.md)):

- **Platform super admin** (create tenants): `/platform/login` — `superadmin@hippo.example` / `SuperAdmin@12345`
- **Tenant admin**: `/login` — tenant `green-valley` / `admin@greenvalley.example` / `Admin@12345`
- **Projects UI**: `/projects` — structure, units, tasks, BOQ, drawings, RFIs, issues

### Testing

```bash
# Run all tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format:check
```

## Architecture

- **Multi-tenant**: Each tenant gets an isolated PostgreSQL schema (`tenant_<slug>`)
- **Control plane**: Tenant registry lives in `public` (see DEC-007)
- **Full-stack Next.js**: Frontend and backend in one app, API routes for server logic
- **Worker**: Separate BullMQ process for provisioning and async jobs
- **Monorepo**: pnpm workspaces + Turborepo for fast builds
- **Git-centric**: Trunk-based development, short-lived feature branches

See [docs/architecture/](docs/architecture/) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Phases

| Phase | Version | Description |
|---|---|---|
| 0 | v0.1.0 | Foundations |
| 1 | v0.2.0 | Identity, RBAC, Tenant Administration |
| 2 | v0.3.0 | Property and Project Planning |
| 3 | v0.4.0 | CRM |
| 4 | v0.5.0 | Construction Progress |
| 5 | v0.6.0 | Payment Engine and Customer Portal |
| 6 | v0.7.0 | Inventory and Procurement |
| 7 | v0.8.0 | Accounting |
| 8 | v0.9.0 | Dashboards |
| 9 | v1.0.0 | AI, HRMS, Mobile, Hardening |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, branch naming, PR requirements, and review process.

## License

Proprietary — All rights reserved.
