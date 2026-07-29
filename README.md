# Construction ERP

Multi-tenant construction management platform built with Next.js as a full-stack application.

## Tech Stack

| Layer | Technology |
|---|---|
| **Full-Stack** | Next.js (App Router) — frontend UI + backend API routes |
| **Styling** | Tailwind CSS |
| **State** | TanStack Query, Zustand |
| **Mobile** | Flutter, Riverpod, GoRouter |
| **Database** | PostgreSQL, Drizzle ORM |
| **Background Jobs** | BullMQ + Redis |
| **Notifications** | Email, SMS, WhatsApp adapters |
| **AI** | Provider-agnostic abstraction with guardrails |

## Repository Structure

```
hippo-build-x/
├── apps/
│   ├── web/          # Next.js full-stack (UI + API routes)
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
- Redis 7+
- Flutter 3.27+ (for mobile)

### Install Dependencies

```bash
pnpm install
```

### Environment Setup

Create `.env.local` in `apps/web/`:

```bash
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/hippo

# Redis (for background jobs)
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# CORS
CORS_ORIGIN=http://localhost:3000
```

### Development

```bash
# Start Next.js (frontend + backend)
pnpm --filter @hippo/web dev

# Mobile
cd apps/mobile && flutter run
```

### Database

```bash
# Generate migrations
pnpm --filter @hippo/db db:generate

# Push schema
pnpm --filter @hippo/db db:push

# Open Drizzle Studio
pnpm --filter @hippo/db db:studio
```

### API Routes

All backend logic lives in Next.js API routes:

```
/api/health          # Health check
/api/health/ready    # Readiness check
/api/auth/login      # Login
/api/auth/logout     # Logout
/api/auth/me         # Current user
/api/auth/reset-password
/api/crm/leads       # CRM leads CRUD
/api/crm/leads/[id]  # Single lead
```

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

- **Multi-tenant**: Each tenant gets an isolated PostgreSQL schema
- **Full-stack Next.js**: Frontend and backend in one app, API routes for server logic
- **Monorepo**: pnpm workspaces + Turborepo for fast builds
- **Git-centric**: Trunk-based development, short-lived feature branches
- **Module ownership**: Every module has named owners for backend, frontend, QA, and security

See [docs/architecture/](docs/architecture/) for detailed architecture documentation.

## Phases

| Phase | Version | Description |
|---|---|---|
| 0 | v0.1.0 | Foundations |
| 1 | v0.2.0 | Identity and Project Structure |
| 2 | v0.3.0 | CRM |
| 3 | v0.4.0 | Construction Progress |
| 4 | v0.5.0 | Payment Engine and Customer Portal |
| 5 | v0.6.0 | Inventory and Procurement |
| 6 | v0.7.0 | Accounting |
| 7 | v0.8.0 | Dashboards |
| 8 | v0.9.0 | AI and HRMS |
| 9 | v1.0.0 | Mobile, Hardening, Production |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, branch naming, PR requirements, and review process.

## License

Proprietary — All rights reserved.
