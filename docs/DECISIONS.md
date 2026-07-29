# Decisions

Record all architectural and technical decisions here.

Format:

```markdown
## DEC-001: Decision Title

- **Date**: YYYY-MM-DD
- **Status**: Accepted | Superseded | Deprecated
- **Context**: Why this decision was needed
- **Decision**: What was decided
- **Consequences**: What this means going forward
```

---

## DEC-001: Monorepo with pnpm Workspaces and Turborepo

- **Date**: 2026-07-27
- **Status**: Accepted
- **Context**: Need a single repository for web, API, worker, mobile, and shared packages to enable atomic cross-cutting changes and shared contracts.
- **Decision**: Use pnpm workspaces with Turborepo for task orchestration.
- **Consequences**: All apps and packages share a single lockfile. CI builds can filter by affected packages.

## DEC-002: JavaScript Only — No TypeScript

- **Date**: 2026-07-27
- **Status**: Accepted
- **Context**: Team preference for plain JavaScript to reduce build complexity and learning curve.
- **Decision**: Use JavaScript with ES modules throughout. Use JSDoc for editor hints where needed.
- **Consequences**: No compile step for source code. ESLint handles code quality. Editor type hints rely on JSDoc annotations.

## DEC-003: Next.js App Router for Web

- **Date**: 2026-07-27
- **Status**: Superseded by DEC-006 (UI kit portion)
- **Context**: Need a production-grade React framework with SSR, routing, and API routes built in.
- **Decision**: Use Next.js App Router. Original decision also specified Tailwind CSS and no Ant Design.
- **Consequences**: File-based routing. Server components by default. Client components only where needed. UI kit updated in DEC-006.

## DEC-004: Multi-tenant with Schema-per-Tenant

- **Date**: 2026-07-27
- **Status**: Accepted
- **Context**: Need strong tenant isolation for data security and compliance.
- **Decision**: Each tenant gets a dedicated PostgreSQL schema. A control-plane registry manages tenants.
- **Consequences**: Migrations run across all tenant schemas. Tenant context is required for all data access. See DEC-007 for control-plane location.

## DEC-005: Deployment Topology — Next.js + Containerized Worker

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: PRD Q1 left open whether to deploy all-Vercel (NestJS incompatible) vs split. The repo already uses Next.js App Router for UI and `/api/v1` routes plus a BullMQ worker.
- **Decision**: Deploy Next.js (UI + API routes) on a Node host or Vercel-compatible runtime; run the BullMQ worker as a separate long-lived container/process. Use Neon-compatible PostgreSQL and managed Redis. Do not use NestJS or a separate Vite SPA.
- **Consequences**: Closes PRD Q1. Supersedes NestJS/Vite stack guidance in the PRD for implementation. WebSocket service remains optional/deferred.

## DEC-006: UI Kit — Ant Design

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: DEC-003 specified Tailwind and excluded Ant Design, but `apps/web` and the taste theme package already use Ant Design 5.
- **Decision**: Use Ant Design 5 (+ Ant Design icons / Next.js registry) as the primary UI kit. Tailwind is not required for Phase 0+.
- **Consequences**: Supersedes the Tailwind-only / no-Ant-Design portion of DEC-003. Design work follows Ant Design patterns and the repo taste profile.

## DEC-008: Argon2id Passwords and Cookie Sessions

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: Phase 1 requires secure identity. Blueprint mandates Argon2id hashes and short-lived access tokens with rotating refresh tokens. Web needs HttpOnly cookies; mobile will use Bearer tokens against the same API.
- **Decision**: Hash passwords with Argon2id via `hash-wasm` (portable across Next.js bundling). Issue `access_token` (15m) and `refresh_token` (7d) as HttpOnly cookies for web. Persist refresh token hashes in tenant `sessions` for rotation and revocation. Accept `Authorization: Bearer` for API/mobile clients.
- **Consequences**: bcryptjs is removed from the auth path. Suspended/deleted users are rejected on every authenticated request. Reused rotated refresh tokens are denied.

## DEC-009: Super Admin Capabilities Mapped to Phases

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: PRD §3 named Super Admin jobs (provision, monitor health, manage plans) without phase DoDs, while the Blueprint only detailed provision in Phase 0. That left suspend/pause/plans/ops underspecified.
- **Decision**: Canonical Super Admin map (must stay identical in PRD §3.1 and Blueprint master roadmap):
  - **Phase 0** — provision tenants (platform APIs + worker).
  - **Phase 1** — platform super-admin login; authenticated create/list tenants; tenant-owned flags/branding/channels.
  - **Phase 12** — suspend/resume, platform-forced kill-switches, plans/subscriptions, cross-tenant health, force session revoke, export/deletion.
- **Consequences**: No orphan Super Admin features. Changes to this map require updating PRD, Blueprint, and the Git-centric Phase 0/1/12 sections in the same change.
