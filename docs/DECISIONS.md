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
- **Status**: Accepted
- **Context**: Need a production-grade React framework with SSR, routing, and API routes built in.
- **Decision**: Use Next.js App Router with Tailwind CSS. No MUI or Ant Design.
- **Consequences**: File-based routing. Server components by default. Client components only where needed.

## DEC-004: Multi-tenant with Schema-per-Tenant

- **Date**: 2026-07-27
- **Status**: Accepted
- **Context**: Need strong tenant isolation for data security and compliance.
- **Decision**: Each tenant gets a dedicated PostgreSQL schema. A control-plane schema manages tenant registry.
- **Consequences**: Migrations run across all tenant schemas. Tenant context is required for all data access.
