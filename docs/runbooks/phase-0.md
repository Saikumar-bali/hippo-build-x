# Phase 0 Foundations — local and CI runbook

## Prerequisites

- PostgreSQL 16+
- Redis 7+ (BullMQ will refuse Redis < 5; Windows Redis 3.x is not supported)
- Node 20 + pnpm 9

## First-time setup

```bash
cp .env.example .env
cp .env.example apps/web/.env.local
pnpm install
pnpm --filter @hippo/db db:migrate:control
pnpm --filter @hippo/db db:seed
```

## Run services

```bash
pnpm --filter @hippo/web dev
pnpm --filter @hippo/worker dev
```

## Verify Phase 0 exit gate

1. `GET /api/v1/health` → 200
2. `GET /api/v1/health/ready` → 200 with database/redis/controlPlane ok
3. `POST /api/v1/platform/tenants` with `{ "name": "Acme", "slug": "acme" }`
4. Wait for worker to mark tenant `active`
5. `GET /api/v1/platform/tenants/:id`
6. `pnpm --filter @hippo/db test` — isolation suite green

## Docker

```bash
docker build -f apps/web/Dockerfile -t hippo-web .
docker build -f apps/worker/Dockerfile -t hippo-worker .
```

Preview environments are deferred until hosting credentials exist.
