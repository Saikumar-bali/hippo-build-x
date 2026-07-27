# Architecture

## System Overview

```
┌─────────────────────────────────────────────────┐
│                  Next.js App                     │
│                                                  │
│  ┌─────────────┐     ┌─────────────────────────┐ │
│  │  Frontend    │     │  Backend (API Routes)   │ │
│  │  (App Router)│     │  /api/*                 │ │
│  │  React +     │     │  Auth, RBAC, Tenant,    │ │
│  │  Tailwind    │     │  Domain modules         │ │
│  └──────┬──────┘     └──────────┬──────────────┘ │
│         │                       │                 │
└─────────┼───────────────────────┼─────────────────┘
          │                       │
          │            ┌──────────┼──────────┐
          │            │          │          │
    ┌─────▼────┐  ┌────▼────┐  ┌─▼──────┐  │
    │  Flutter  │  │PostgreSQL│  │ Redis  │  │
    │  Mobile   │  │(Drizzle) │  │(BullMQ)│  │
    └──────────┘  └─────────┘  └────────┘  │
                                            │
                                   ┌────────▼────────┐
                                   │  Background Jobs  │
                                   │  (Notifications,  │
                                   │   Reports, AI)    │
                                   └─────────────────┘
```

## Why Next.js for Everything

- **Single deployment**: Frontend and backend deploy together
- **Shared code**: Validation, types, and utilities shared between client and server
- **API Routes**: Backend logic in `/app/api/*` with full Node.js access
- **Server Components**: Data fetching on the server, smaller client bundles
- **Middleware**: Tenant resolution and auth checks at the edge
- **Background jobs**: BullMQ queues processed via API route triggers

## Multi-tenancy

- **Schema-per-tenant**: Each tenant has an isolated PostgreSQL schema
- **Control plane**: A shared `public` schema stores the tenant registry
- **Tenant resolution**: Middleware extracts tenant from JWT or subdomain
- **No cross-tenant access**: All queries are scoped to the tenant schema

## Module Structure

Each module follows the same pattern:

```
apps/web/src/
├── app/api/<module>/       # API routes (backend)
│   ├── route.js            # List + Create
│   ├── [id]/route.js       # Read + Update + Delete
│   └── [id]/<action>/route.js  # Custom actions
├── app/(dashboard)/<module>/ # Pages (frontend)
│   ├── page.js             # List page
│   ├── [id]/page.js        # Detail page
│   └── new/page.js         # Create page
├── modules/<module>/       # Shared module code
│   ├── components/         # React components
│   ├── hooks/              # Custom hooks
│   └── schemas/            # Validation schemas
└── lib/                    # Shared utilities
    ├── api-utils.js        # API response helpers
    ├── auth.js             # JWT utilities
    └── queues.js           # BullMQ queues
```

See individual module documentation in `docs/modules/`.
