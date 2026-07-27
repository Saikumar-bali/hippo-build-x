# Architecture

## System Overview — Three-Process Architecture

The application runs as three separate processes that communicate via Redis and PostgreSQL:

```
┌─────────────────────────────────────────────────────────────┐
│  Process 1: Next.js (port 3000)                              │
│                                                              │
│  ┌──────────────────┐     ┌──────────────────────────────┐  │
│  │  Frontend (SSR)   │     │  Backend (API Routes)        │  │
│  │  App Router       │     │  /api/*                      │  │
│  │  React + Tailwind │     │  Auth, RBAC, Tenant, Domain  │  │
│  └──────────────────┘     └──────────────────────────────┘  │
│                                                              │
│  Handles: Pages, REST API, Auth, Tenant resolution,         │
│           Form validation, File uploads, SSR/ISR            │
└─────────────────────┬───────────────────────────────────────┘
                      │ queries
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────────────┐
│PostgreSQL │  │  Redis    │  │  Process 2:       │
│(primary)  │  │ (queue +  │  │  Worker           │
│           │  │  pub/sub) │  │  (BullMQ consumer)│
└──────────┘  └──────────┘  │                   │
                            │  Handles:         │
                            │  - Notifications  │
                            │  - PDF generation │
                            │  - AI inference   │
                            │  - Scheduled jobs │
                            │  - Report builds  │
                            └────────┬──────────┘
                                     │
                            ┌────────▼──────────┐
                            │  Process 3:        │
                            │  WebSocket Server  │
                            │  (port 3001)       │
                            │                    │
                            │  Handles:          │
                            │  - Real-time push  │
                            │  - Dashboard live  │
                            │  - Notifications   │
                            │  - Customer portal │
                            └───────────────────┘
```

## Why Three Processes

| Process | Why it's separate | Can it be in Next.js? |
|---|---|---|
| **Next.js** | Frontend + API routes | This IS Next.js |
| **Worker** | Long-running jobs, retries, cron schedules — API routes timeout after ~30s | No — needs persistent process |
| **WebSocket server** | Persistent connections for real-time push — API routes are request/response | No — needs persistent process |

## What Each Process Does

### Process 1 — Next.js (Main App)

| Capability | Implementation |
|---|---|
| Frontend pages | React Server Components + App Router |
| REST API | `/app/api/*` route handlers |
| Authentication | Middleware + `jose` JWT library |
| Tenant resolution | Middleware extracts tenant from JWT |
| Form validation | Server-side validation in API routes |
| File uploads | API routes + S3-compatible storage |
| SSR/ISR | Server-side rendering for dashboards |

### Process 2 — Worker (Background Jobs)

| Capability | Implementation |
|---|---|
| Notification dispatch | BullMQ job consumer → email/SMS/WhatsApp adapters |
| PDF generation | Demand letters, invoices, reports |
| AI inference | OpenAI API calls with guardrails |
| Scheduled jobs | Cron-based reminders, follow-ups, low-stock alerts |
| Report generation | Aggregated data → PDF/Excel |
| Retry logic | BullMQ automatic retries with exponential backoff |

### Process 3 — WebSocket Server (Real-time)

| Capability | Implementation |
|---|---|
| Dashboard live updates | Push new data to connected clients |
| Notification push | Instant alerts without polling |
| Customer portal | Real-time progress and payment updates |
| Construction progress | Live site updates from mobile |

## Capabilities Assessment

### What works directly in Next.js

| Requirement | Status | Notes |
|---|---|---|
| REST API | Works | API route handlers |
| Database queries | Works | PostgreSQL + pg |
| JWT authentication | Works | middleware + jose |
| Multi-tenancy | Works | Schema-per-tenant |
| RBAC | Works | Middleware + DB |
| Rate limiting | Works | Middleware |
| Form validation | Works | Server-side JS |
| File uploads | Works | API routes + S3 |
| PDF generation | Works | API routes (can timeout on large PDFs) |
| Email/SMS/WhatsApp | Works | Adapter pattern + API calls |

### What needs separate processes

| Requirement | Problem | Solution |
|---|---|---|
| WebSockets | API routes are short-lived | Standalone WebSocket server |
| Background workers | BullMQ needs persistent process | Separate worker process |
| Real-time push | No persistent connections | WebSocket server or service (Pusher/Ably) |
| Scheduled tasks | No built-in cron | Worker with node-cron or cron service |
| Long-running jobs | API routes timeout at ~30s | Worker process with BullMQ |

## Running Locally

```bash
# Terminal 1: Next.js (frontend + API)
cd apps/web && pnpm dev

# Terminal 2: Worker (background jobs)
cd apps/worker && pnpm dev

# Terminal 3: WebSocket server (real-time)
cd apps/ws && node src/server.js
```

## Running in Production

| Process | Deployment |
|---|---|
| Next.js | Vercel, Railway, or container |
| Worker | Same host as Next.js, or separate container |
| WebSocket | Same host, or use Pusher/Ably as a managed service |
| PostgreSQL | Neon, Railway, or self-hosted |
| Redis | Upstash, Redis Cloud, or self-hosted |

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
    └── db.js               # Database connection
```

See individual module documentation in `docs/modules/`.
