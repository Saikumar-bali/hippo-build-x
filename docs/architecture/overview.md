# Architecture

## System Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Next.js Web │     │  Flutter App │     │  Customer    │
│  (App Router)│     │  (Mobile)    │     │  Portal      │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────┬───────┴───────────────────┘
                   │
            ┌──────▼──────┐
            │  NestJS API  │
            │  (REST)      │
            └──────┬──────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼──┐  ┌────▼────┐  ┌──▼───────┐
│PostgreSQL│  │  Redis   │  │  Object  │
│(Drizzle) │  │(BullMQ)  │  │  Storage │
└──────────┘  └────┬────┘  └──────────┘
                   │
            ┌──────▼──────┐
            │   Workers    │
            │ (Notifications│
            │  Reports, AI) │
            └─────────────┘
```

## Multi-tenancy

- **Schema-per-tenant**: Each tenant has an isolated PostgreSQL schema
- **Control plane**: A shared `public` schema stores the tenant registry
- **Tenant resolution**: Middleware extracts tenant from JWT or subdomain
- **No cross-tenant access**: All queries are scoped to the tenant schema

## Module Structure

Each module follows the same pattern:

```
module/
├── controllers/    # Thin HTTP handlers
├── services/       # Business logic
├── repositories/   # Database access
├── domain/         # State machines, rules
├── dto/            # Request/response shapes
├── guards/         # Permission checks
├── events/         # Domain events
├── jobs/           # Background tasks
└── tests/          # Module tests
```

See individual module documentation in `docs/modules/`.
