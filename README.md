# Construction ERP

Multi-tenant construction management platform built with a Git-centric, monorepo architecture.

## Tech Stack

| Layer | Technology |
|---|---|
| **Web Frontend** | Next.js (App Router), Tailwind CSS, TanStack Query, Zustand |
| **API** | NestJS, REST, Swagger |
| **Worker** | BullMQ, Redis |
| **Mobile** | Flutter, Riverpod, GoRouter |
| **Database** | PostgreSQL, Drizzle ORM |
| **Notifications** | Email, SMS, WhatsApp adapters |
| **AI** | Provider-agnostic abstraction with guardrails |

## Repository Structure

```
hippo-build-ex/
├── apps/
│   ├── web/          # Next.js App Router
│   ├── api/          # NestJS REST API
│   ├── worker/       # BullMQ background jobs
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

Create `.env` files in each app directory:

```bash
# apps/api/.env
DATABASE_URL=postgres://user:pass@localhost:5432/hippo
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
PORT=3001

# apps/worker/.env
DATABASE_URL=postgres://user:pass@localhost:5432/hippo
REDIS_URL=redis://localhost:6379
```

### Development

```bash
# Start all apps
pnpm dev

# Start specific app
pnpm --filter @hippo/api dev
pnpm --filter @hippo/web dev
pnpm --filter @hippo/worker dev

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

### Testing

```bash
# Run all tests
pnpm test

# Run specific app tests
pnpm --filter @hippo/api test
pnpm --filter @hippo/web test

# Lint
pnpm lint

# Format
pnpm format:check
```

## Architecture

- **Multi-tenant**: Each tenant gets an isolated PostgreSQL schema
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
