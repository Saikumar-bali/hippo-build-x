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
- **Decision**: Each tenant gets a dedicated PostgreSQL schema. A shared control-plane registry manages tenant identity and data-source routing.
- **Consequences**: Migrations run across tenant schemas. Tenant context is required for all business data access. See DEC-007 and DEC-010.

## DEC-005: Deployment Topology — Next.js + Containerized Worker

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: PRD Q1 left open whether to deploy all-Vercel vs split. The repo already uses Next.js App Router for UI and `/api/v1` routes plus a BullMQ worker.
- **Decision**: Deploy Next.js on a Node host or Vercel-compatible runtime; run the BullMQ worker as a separate long-lived process. Use Neon-compatible PostgreSQL and managed Redis.
- **Consequences**: Supersedes NestJS/Vite guidance. WebSocket service remains optional/deferred.

## DEC-006: UI Kit — Ant Design

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: DEC-003 specified Tailwind and excluded Ant Design, but `apps/web` already uses Ant Design 5.
- **Decision**: Use Ant Design 5 as the primary UI kit.
- **Consequences**: Supersedes the Tailwind-only portion of DEC-003.

## DEC-007: Explicit Control Plane Schema

- **Date**: 2026-07-30
- **Status**: Accepted
- **Context**: Early Phase 0 code placed shared application tables in `public`, while PRD §5 locks a distinct control plane and tenant schemas.
- **Decision**: All shared SaaS records live under PostgreSQL schema `control_plane`. `public` is not an application data store. Transitional read-only views may exist for one rolling-release window.
- **Consequences**: Control-plane access uses a dedicated context factory. Tenant search paths exclude `public`. Platform and tenant modules cannot silently fall through to shared tables.

## DEC-008: Argon2id Passwords and Cookie Sessions

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: Phase 1 requires secure identity. Blueprint mandates Argon2id hashes and short-lived access tokens with rotating refresh tokens.
- **Decision**: Hash passwords with Argon2id. Issue 15-minute access tokens and 7-day rotating refresh tokens as HttpOnly cookies for web. Persist tenant refresh-token hashes in tenant `sessions`.
- **Consequences**: Suspended/deleted users are rejected on every request. Reused rotated refresh tokens are denied.

## DEC-009: Super Admin Capabilities Mapped to Phases

- **Date**: 2026-07-29
- **Status**: Accepted
- **Context**: PRD §3 named Super Admin jobs without complete phase ownership.
- **Decision**:
  - **Phase 0** — provision tenants.
  - **Phase 1** — platform super-admin login; authenticated create/list tenants; tenant-owned flags/branding/channels.
  - **Phase 12** — suspend/resume, platform-forced flags, plans/subscriptions, cross-tenant health, force session revoke, export/deletion.
- **Consequences**: No orphan Super Admin features. Changes require PRD and Blueprint updates in the same PR.

## DEC-010: Authoritative Tenant Data-Source Resolution

- **Date**: 2026-07-30
- **Status**: Accepted
- **Context**: Slugs can be renamed and tokens are client-controlled inputs. Neither is a safe database locator. Large P2 tenants also need a path to dedicated databases without changing APIs.
- **Decision**:
  - New shared schemas are named from immutable tenant UUIDs: `tenant_<uuid-without-hyphens>`.
  - Access/refresh tokens contain `tenantId`, not schema names, connection URLs or authorization arrays.
  - Every request resolves `isolation_mode`, `schema_name` and future `database_secret_ref` from `control_plane.tenants`.
  - Tenant SQL is transaction-bound, requires `tenantId`, excludes `public`, sets `app.tenant_id`, and runs behind forced RLS policies bound to the schema owner.
  - Tenant migration state is recorded both locally and centrally with checksums.
- **Consequences**: Existing slug-named schemas remain supported. New tenants use immutable names. Moving a P2 tenant to a dedicated database changes only the control-plane locator, not tokens or API contracts. Schema-qualified hostile access is covered by mandatory CI.
