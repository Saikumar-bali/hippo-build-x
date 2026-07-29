# Construction ERP — Git-Centric Multi-Developer Delivery Plan

## 1. Purpose

This document defines how multiple developers can build the Construction ERP together using a professional, Git-centric engineering workflow.

The objectives are to:

- Allow backend, frontend, mobile, QA, DevOps, and product teams to work in parallel.
- Keep the `main` branch stable and deployable.
- Deliver every module end to end.
- Prevent merge conflicts, duplicate implementations, and unclear ownership.
- Enforce security, tenant isolation, migrations, testing, documentation, and review gates.
- Provide a repeatable process for all phases and modules.

The underlying product must be built phase by phase. Every module must include its data model, API, UI, tests, seed data, permissions, audit behavior, and documentation before it is considered complete.

---

# 2. Recommended Engineering Model

Use a **trunk-based development model** with short-lived feature branches.

## Core rules

- `main` is the only permanent development branch.
- `main` must always be buildable, testable, and deployable.
- Developers must not push directly to `main`.
- Every change must enter through a pull request.
- Feature branches should be small and short-lived.
- Incomplete features must be protected by feature flags.
- GitHub Issues and GitHub Projects should be the source of truth for work.
- CI checks must pass before merging.
- Database migrations must be reviewed by a human.
- Tenant-isolation tests must block merging.
- Financial and inventory workflows must have idempotency and transaction tests.

Avoid long-lived branches such as:

```text
frontend
backend
development
phase-1
phase-2
final-complete
```

Long-lived branches create stale code, hidden integration problems, and large merge conflicts.

---

# 3. Team Structure

A professional project should define clear team ownership.

| Team | Main Responsibilities |
|---|---|
| Product | Requirements, acceptance criteria, priorities, workflow review |
| Architecture | Technical direction, module boundaries, shared contracts |
| Platform | Monorepo, tenancy, shared libraries, events, queues |
| Backend | Next.js API Routes, services, repositories, DTOs, jobs |
| Web | Next.js, Tailwind CSS, TanStack Query, dashboards, portals |
| Mobile | Flutter role experiences, offline sync, device features |
| Database | Drizzle schemas, migrations, indexes, migration runner |
| QA | Unit, integration, API, UI, mobile, regression, isolation tests |
| DevOps/SRE | CI/CD, environments, deployments, monitoring, secrets |
| Security | RBAC, tenant isolation, PII, auditability, threat review |
| Design | UI system, UX standards, responsive behavior, accessibility |

For smaller teams, one person may handle multiple responsibilities, but ownership must still be recorded.

---

# 4. Module Ownership Model

Every module must have named owners.

Example:

```text
Module: CRM

Module Owner: Developer A
Backend Owner: Developer A
Frontend Owner: Developer B
QA Owner: Developer C
Database Reviewer: Developer D
Security Reviewer: Developer E
Product Approver: Product Manager
```

Recommended ownership records:

```text
/docs/ownership/modules.md
/.github/CODEOWNERS
```

Example `CODEOWNERS`:

```text
/apps/web/src/modules/crm/          @backend-crm @architect
/apps/web/src/modules/crm/          @frontend-crm @design-reviewer
/apps/mobile/lib/features/crm/      @mobile-team
/packages/db/                       @database-team @architect
/packages/rbac/                     @security-team @architect
/packages/notifications/            @platform-team
/.github/workflows/                 @devops-team
```

This automatically requests the correct reviewers for every pull request.

---

# 5. Repository Structure

Use the monorepo structure below.

```text
/apps
  /web
  /mobile

/packages
  /db
  /shared
  /ai
  /notifications
  /rbac

/docs
  /adr
  /rfc
  /architecture
  /modules
  /testing
  /runbooks
  data-model.md
  DECISIONS.md
  api.md

/.github
  /ISSUE_TEMPLATE
  /workflows
  CODEOWNERS
  PULL_REQUEST_TEMPLATE.md
```

## Applications

```text
/apps/web
```

Next.js App Router — full-stack application with API Routes for backend logic, Tailwind CSS, TanStack Query, Zustand. Handles both frontend UI and backend API (authentication, RBAC, tenant resolution, domain modules, background jobs via BullMQ).

```text
/apps/mobile
```

Flutter application with role-based experiences.

## Shared packages

```text
/packages/db
```

Drizzle schemas, migrations, database helpers, tenant migration runner.

```text
/packages/shared
```

DTOs, API types, enums, validation contracts, event contracts.

```text
/packages/rbac
```

Permissions, guards, scope resolvers, permission matrix.

```text
/packages/notifications
```

Email, WhatsApp, SMS adapters and templates.

```text
/packages/ai
```

AI abstraction, provider adapters, usage tracking, guardrails.

---

# 6. Git Branching Strategy

## Branch naming

Use issue-based branch names.

```text
feat/CRM-142-lead-state-machine
fix/CRM-181-followup-timezone
test/PAY-208-idempotency-cases
refactor/PLAT-044-tenant-context
docs/ARCH-019-event-contracts
chore/DEVOPS-031-ci-cache
hotfix/AUTH-301-refresh-token-reuse
```

Recommended branch prefixes:

| Prefix | Purpose |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `test/` | Tests |
| `refactor/` | Internal code improvement |
| `docs/` | Documentation |
| `chore/` | Tooling, configuration, maintenance |
| `hotfix/` | Urgent production correction |

## Starting work

```bash
git checkout main
git pull --rebase origin main
git checkout -b feat/CRM-142-lead-state-machine
```

## Keeping the branch current

```bash
git fetch origin
git rebase origin/main
```

## Before creating a pull request

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

## Merge policy

Recommended GitHub settings:

- Protect `main`.
- Disable direct pushes.
- Require pull requests.
- Require branch to be updated before merge.
- Require status checks.
- Require code-owner approval.
- Require conversation resolution.
- Require linear history.
- Enable merge queue.
- Enable automatic branch deletion.
- Use squash merging for normal work.
- Disable merge commits.

## Review requirements

| Change Type | Minimum Approval |
|---|---:|
| Documentation | 1 |
| Standard feature | 1 |
| Database migration | 2 |
| Authentication/RBAC | 2 |
| Tenant isolation | 2 |
| Financial workflow | 2 |
| Inventory transaction | 2 |
| CI/CD or infrastructure | 2 |
| Production hotfix | 1 plus post-merge review |

---

# 7. Work Hierarchy

Use a consistent hierarchy.

```text
Initiative
  └── Phase
       └── Module Epic
            └── Feature
                 └── User Story
                      └── Engineering Task
                           └── Pull Request
```

Example:

```text
Initiative: Construction ERP v1

Phase: Phase 3 — CRM

Epic: Lead Management

Feature: Pipeline State Machine

User Story:
As a CRM executive,
I want invalid pipeline transitions to be rejected,
so that lead history remains reliable.

Tasks:
- Define state transition map
- Add domain service
- Add REST endpoint
- Add RBAC permissions
- Add audit log
- Add web action
- Add unit tests
- Add API E2E tests
```

---

# 8. GitHub Project Board

Recommended columns:

```text
Backlog
Ready for Design
Ready for Development
In Development
In Review
QA Testing
Product Review
Ready for Release
Done
Blocked
```

Recommended custom fields:

| Field | Example |
|---|---|
| Phase | Phase 3 |
| Module | CRM |
| Type | Feature |
| Priority | P0 |
| Owner | Developer A |
| QA Owner | Developer B |
| Risk | High |
| Target Release | v0.3 |
| Status | In Development |
| Dependency | PLAT-044 |
| Feature Flag | `crm.pipeline.enabled` |

---

# 9. Standard Module Delivery Process

Every module must follow the same end-to-end workflow.

---

## Step 1 — Write the Module RFC

Create:

```text
/docs/rfc/RFC-CRM-001-lead-management.md
```

The RFC should contain:

- Purpose
- Scope
- Out-of-scope items
- User roles
- User journeys
- State machines
- Entities
- Relationships
- API contracts
- Permissions
- Events
- Jobs
- UI pages
- Error conditions
- Security concerns
- Acceptance criteria
- Testing strategy
- Rollout plan

The RFC must be approved before database implementation begins.

---

## Step 2 — Define Shared Contracts

Create contracts before backend and frontend teams work separately.

Example:

```text
/packages/shared/src/contracts/crm/
  lead.dto.js
  lead-response.dto.js
  lead-events.js
  lead-errors.js
  lead-enums.js
```

Contracts should define:

- Request DTOs
- Response DTOs
- Pagination
- Error codes
- Event payloads
- Enums
- Validation rules
- Filter and sorting parameters

Frontend and mobile teams may begin against mocks generated from these contracts.

---

## Step 3 — Design the Data Model

Update:

```text
/packages/db/src/schema/
```

Include:

- Tables
- Columns
- Enums
- Foreign keys
- Unique constraints
- Indexes
- Audit fields
- Soft-delete fields
- Data-retention behavior
- Tenant-schema location

Every migration pull request must list:

```text
Migration name
Tables created
Columns added
Constraints added
Indexes added
Data backfill
Rollback or forward-fix plan
Tenant schemas affected
```

Never edit an already-applied migration.

---

## Step 4 — Implement the Backend Module

Recommended structure:

```text
/apps/web/src/modules/crm/
  crm.module.js
  controllers/
  services/
  repositories/
  domain/
  dto/
  guards/
  policies/
  events/
  jobs/
  tests/
```

Recommended request flow:

```text
Controller
  → DTO validation
  → Tenant resolver
  → Permission guard
  → Scope validation
  → Domain service
  → Tenant-aware repository
  → Database transaction
  → Domain event
  → Audit log
  → Background job
  → API response
```

Rules:

- Controllers should remain thin.
- Business logic belongs in domain services.
- Repositories must require tenant context.
- No global database client for tenant data.
- State changes must create audit records.
- Notifications and PDF generation must not run inside controllers.
- Unknown request fields must be rejected.
- Idempotency keys must be supported for financial and critical operations.

---

## Step 5 — Implement the Web Module

Recommended structure:

```text
/apps/web/src/modules/crm/
  api/
  components/
  forms/
  hooks/
  permissions/
  schemas/
  tests/
```

Next.js App Router routes:

```text
/apps/web/app/(dashboard)/crm/
  page.jsx
  loading.jsx
  error.jsx
  [id]/
    page.jsx
  new/
    page.jsx
  [id]/edit/
    page.jsx
```

Each module should include:

- List page
- Search
- Filters
- Pagination
- Sorting
- Create page or modal
- Edit page or modal
- Detail page
- Timeline/history
- Permission-aware actions
- Confirmation dialogs
- Loading state
- Empty state
- Error state
- Responsive layout
- Audit/history access where relevant

---

## Step 6 — Implement Mobile Workflows

For mobile-enabled modules:

```text
/apps/mobile/lib/features/crm/
  data/
  domain/
  presentation/
  sync/
  tests/
```

Include:

- API integration
- Generated client
- Secure storage
- Role-based access
- Local validation
- Offline queue
- Retry
- Conflict resolution
- Upload progress
- GPS/media permissions
- Mobile tests

---

## Step 7 — Add Domain Events and Jobs

Use domain events for side effects.

Example:

```text
progress.updated
  ├── payment milestone evaluator
  ├── customer notification job
  ├── dashboard projection refresh
  └── audit trail
```

Do not perform these synchronously inside request handlers:

- Email sending
- SMS sending
- WhatsApp sending
- PDF generation
- AI inference
- Large report generation
- Scheduled reminders
- Dashboard aggregation

---

## Step 8 — Add Automated Tests

Every module requires:

- Unit tests
- Repository tests
- Integration tests
- API E2E tests
- Permission tests
- Project-scope tests
- Location-scope tests
- Tenant-isolation tests
- State-machine tests
- Idempotency tests
- UI tests
- Seed-data smoke tests
- Retry and failure tests

Every P0 acceptance criterion must map to at least one automated test.

---

## Step 9 — Add Seed Data

Seed data must demonstrate realistic workflows.

Example:

```text
Tenant: Green Valley Developers
Project: Green Valley Residency
Tower: A
Floor: 5
Unit: A-502
Customer: Ramesh Kumar
Activity: Fifth-floor slab
Payment Milestone: Slab completion — 15%
Warehouse: Central Site Store
Material: OPC Cement
Vendor: Sri Lakshmi Building Materials
```

Seed data must support:

- Developer testing
- QA testing
- Product demos
- Dashboard testing
- End-to-end workflows

---

## Step 10 — Add Documentation

Update:

- Module README
- OpenAPI documentation
- ER diagram
- Permission matrix
- User workflow
- Event documentation
- Queue/job documentation
- Runbook
- Troubleshooting guide
- Known limitations
- Monitoring metrics

---

## Step 11 — Add a Feature Flag

Example flags:

```text
crm.enabled
crm.pipeline.enabled
construction.progress.enabled
payment.engine.enabled
customer.portal.enabled
inventory.enabled
ai.copilot.enabled
```

Feature flags allow code to merge safely before full customer rollout.

---

## Step 12 — Demonstrate the Module

The module owner must demonstrate:

```text
Seed data
→ UI action
→ API request
→ Database change
→ Audit entry
→ Event emitted
→ Worker executed
→ Notification or dependent result
→ Automated test evidence
```

A backend-only implementation is not considered complete when the module requires UI or mobile behavior.

---

# 10. Phase-by-Phase Development Plan

---

# Phase 0 — Foundations

## Main outcomes

- Monorepo
- CI/CD
- Tenant schemas
- Tenant provisioning
- Migration runner
- Tenant resolver
- Shared contracts
- Logging
- Error handling
- Isolation test suite

## Parallel workstreams

### Platform developer

- Initialize pnpm workspaces.
- Configure Turborepo.
- Enable strict ESLint.
- Create web, API, and worker applications.
- Create shared packages.
- Add environment validation.
- Add structured logging.
- Add standard error envelope.

### Database developer

- Create `control_plane` schema.
- Create tenant schema template.
- Create migration tooling.
- Create tenant migration runner.
- Add migration version tracking.
- Add tenant provisioning logic.
- Add provisioning rollback behavior.

### Backend developer

- Build tenant resolver middleware.
- Create request-scoped tenant database context.
- Reject repository access without tenant context.
- Add health endpoint.
- Add readiness endpoint.

### QA developer

- Build cross-tenant isolation tests.
- Build tenant provisioning E2E test.
- Build migration idempotency test.
- Build tenant test factory.

### DevOps developer

- Add CI workflows.
- Add caching.
- Add test Postgres and Redis services.
- Add secret scanning.
- Add dependency scanning.
- Add Docker builds.
- Add preview environments.

## Definition of Done

- A tenant can be provisioned without manual SQL.
- Tenant A cannot access Tenant B.
- Tenant migrations run across all active tenant schemas.
- Re-running migrations is safe.
- CI is required before merging.
- Seed data creates a working demo tenant.
- Super Admin **provision** path works (platform create tenant + retry). Suspend/plans/health ops are **not** required yet (Phase 12).

---

# Phase 1 — Identity, RBAC, and Tenant Administration

## Authentication workstream

- Login
- Logout
- Access tokens
- Rotating refresh tokens
- Session revocation
- Password reset
- OTP framework
- Rate limiting
- Secure cookie strategy for web
- Secure token storage strategy for mobile
- **Platform super-admin login** (`platform_users`, JWT `scope=platform`)

## RBAC workstream

- User CRUD
- Role CRUD
- Permission CRUD
- Role-permission assignment
- Project assignments
- Location assignments
- Permission guards
- Scope resolver
- Auditor read-only enforcement

## Tenant administration workstream

- Tenant profile
- Branding
- Users
- Roles
- Feature flags (**tenant-owned**)
- Notification channel configuration
- Tenant health (tenant-local)
- Channel test actions

## Platform administration workstream (Phase 1 slice)

- Seeded platform super admin
- Platform login / logout / me
- Authenticated create/list tenants UI
- Explicitly **deferred to Phase 12**: suspend/resume, forced kill-switches, plans/subscriptions, cross-tenant ops health, export/delete

## Audit workstream

- Shared audit interceptor
- Before/after snapshots
- Actor details
- Entity details
- Tenant details
- Request correlation ID
- Audit log search page

## Definition of Done

- Authentication works for web and API.
- Refresh tokens rotate and can be revoked.
- Four-axis permission checks work.
- Auditor cannot perform writes.
- Tenant admin can manage users and roles.
- Platform super admin can sign in and create tenants.
- Every state-changing endpoint creates an audit record.

---

# Phase 2 — Property and Project Planning

## Epics

1. Project master
2. Block management
3. Tower management
4. Floor management
5. Unit bulk generation
6. Unit status history
7. Milestones
8. Tasks
9. Dependencies
10. Gantt view
11. BOQ
12. Drawings
13. RFIs
14. Issues
15. Approvals
16. Project budget

## Critical shared contract

```text
Unit ID
```

The same unit identifier must be used by:

- CRM booking
- Construction progress
- Payment plans
- Customer portal
- Documents
- Project costing

## End-to-end scenario

```text
Create project
→ Create tower
→ Generate floors and units
→ Configure unit categories
→ Set availability
→ Create milestones
→ Create tasks and dependencies
→ Upload drawing
→ Add BOQ
→ Display Gantt
```

---

# Phase 3 — CRM

## Epics

1. Lead source
2. Lead master
3. Lead assignment
4. Pipeline state machine
5. Lead activity timeline
6. Follow-up reminders
7. Website lead adapter
8. Advertising-source adapter
9. WhatsApp inbound adapter
10. Campaign tracking
11. Booking
12. Agreement
13. KYC encryption
14. Unit reservation
15. Convert to customer
16. Portal provisioning

## End-to-end scenario

```text
Lead received
→ Source recorded
→ Lead assigned
→ Follow-up scheduled
→ Site visit recorded
→ Negotiation
→ Unit reserved
→ Booking created
→ Agreement uploaded
→ Payment plan attached
→ Customer identity created
→ Portal access provisioned
→ Audit history completed
```

## Required tests

- Valid pipeline transitions
- Invalid pipeline transitions
- Duplicate lead detection
- Follow-up reminder job
- KYC masking
- `kyc.view.full` permission
- Cross-tenant access
- Booking-to-customer conversion
- Unit reservation conflict

---

# Phase 4 — Construction Progress and Notifications

## Construction workstream

- Activity templates
- Activity weights
- Unit activities
- Checklists
- Progress submissions
- Photos
- Inspections
- Engineer approval
- Progress calculation
- Customer-facing timeline

## Notification workstream

- Notification templates
- Consent records
- Email adapter
- SMS adapter
- WhatsApp adapter
- Provider callbacks
- Retry
- Dead-letter queue
- Notification log

## Platform workstream

- `progress.updated` event
- Object storage
- Signed URLs
- Realtime push
- Idempotent worker framework

## End-to-end scenario

```text
Site engineer submits progress
→ Photos uploaded
→ Checklist completed
→ PM approves
→ Unit progress recalculated
→ progress.updated emitted
→ Notification queued
→ Customer notified
→ AuditLog written
→ NotificationLog written
```

---

# Phase 5 — Payment-vs-Progress and Customer Portal

## Epics

1. Payment plan
2. Payment milestone
3. Progress threshold rule
4. Demand-letter generation
5. Demand-letter idempotency
6. PDF rendering
7. Email dispatch
8. WhatsApp dispatch
9. SMS dispatch
10. Receipt recording
11. Schedule reconciliation
12. Customer payment view
13. Customer construction timeline
14. Document downloads
15. Realtime updates
16. Support workflow

## Canonical rule

```text
WHEN unit progress crosses a configured payment threshold
AND the installment has not already been demanded
AND previous-payment rules allow the demand

THEN
create exactly one demand letter
generate a branded PDF
dispatch through configured channels
mark the milestone as demanded
write NotificationLog
write AuditLog
```

## Mandatory idempotency test

```text
Previous progress: 39%
New progress: 42%
Payment threshold: 40%

Expected:
- One demand letter
- One milestone status change
- One audit chain
- Notification jobs created
- Replaying the same event creates no duplicate
```

AI must never create or modify demand letters, receipts, payment plans, inventory, or ledger records.

---

# Phase 6 — Inventory and Procurement

## Inventory epics

- Material master
- Warehouse master
- Stock level
- GRN
- Material issue
- Consumption
- Stock transfer
- Stock return
- Low-stock alert
- ABC analysis
- Dead-stock report
- Stock ledger

## Procurement epics

- Vendor master
- RFQ
- Quotation
- Quotation comparison
- Purchase order
- Approval
- Vendor invoice
- Vendor payment
- Vendor score

## End-to-end scenario

```text
BOQ requirement
→ RFQ
→ Vendor quotations
→ Quotation comparison
→ Approved purchase order
→ Material delivery
→ GRN
→ Stock increases
→ Material issued
→ Project consumption recorded
→ Project costing updated
```

## Mandatory transaction rules

- GRN increases stock atomically.
- Material issue decreases stock atomically.
- Transfer reduces source and increases destination in one transaction.
- Return updates the correct warehouse.
- Negative stock is rejected unless explicitly configured.
- Duplicate idempotency keys cannot repeat stock movement.

---

# Phase 7 — Operational Accounting

## Epics

- Chart of accounts
- AR invoice
- Receipt
- AP invoice
- Vendor payment
- Operational ledger
- Bank transaction import
- Reconciliation
- GST fields
- Cost centers
- Project costing
- Budgets
- Cash-flow view

## End-to-end scenario

```text
Demand letter
→ Customer invoice
→ Receipt recorded
→ AR balance updated
→ Ledger entry created
→ Project and cost-center tags applied
→ Finance dashboard updated
```

## Boundary

Version 1 provides operational accounting.

Full statutory double-entry accounting and certified GST filing should remain a later phase unless separately approved.

---

# Phase 8 — Role Dashboards

Build dashboards only from real module data.

## Dashboards

- CEO
- Sales
- Project Manager
- Procurement
- Finance
- HR
- Customer

## Engineering approach

- Create aggregation services.
- Use pre-aggregated tables or materialized views where needed.
- Avoid many small browser requests.
- Apply RBAC, project scope, and location scope.
- Provide empty states.
- Add drill-down links.
- Add caching where appropriate.
- Test dashboard data permissions.

---

# Phase 9 — AI Copilot

## Epics

- AI provider abstraction
- OpenAI adapter
- Interaction logging
- Token and cost limits
- CRM suggestions
- Delay-risk suggestions
- Cash-flow forecast suggestions
- Customer chatbot
- Tenant-data retrieval
- Confidence labels
- Human approval workflows
- Guardrail tests

## Hard rules

AI may:

- Summarize
- Predict
- Recommend
- Draft
- Classify
- Answer permitted questions

AI may not directly:

- Change pipeline stages
- Create demand letters
- Record receipts
- Change stock
- Create ledger entries
- Change payment plans
- Approve purchases
- Modify financial records

---

# Phase 10 — HRMS

## Epics

- Employee master
- Contractor master
- Attendance
- GPS validation
- Labour attendance
- Biometric CSV import
- Biometric webhook
- Leave requests
- Leave approval
- Salary structures
- Payroll run
- Payslips
- Employee documents
- Performance reviews
- Training records

## End-to-end scenario

```text
Attendance captured
→ Leave adjustments approved
→ Payroll period locked
→ Salary calculated
→ Payslip generated
→ Labour cost recorded
→ Project costing updated
```

---

# Phase 11 — Flutter Mobile

Use one Flutter codebase with role-aware experiences.

## Role shells

- Employee
- Site Engineer
- Sales
- Customer

## Shared platform work

- Authentication
- Tenant context
- Generated API client
- Secure token storage
- Local database
- Offline operation queue
- Retry strategy
- Conflict handling
- Media upload queue
- Push notifications
- Crash reporting
- Device permissions

## Offline requirements

Employee and Site Engineer workflows should support:

- Attendance offline queue
- Progress update offline queue
- Photo upload retry
- Local validation
- Reconnect synchronization
- Server timestamp conflict handling
- Audit records for conflict resolution

---

# Phase 12 — Hardening, Platform Ops, and Production Release

## Workstreams

- Load testing
- Query optimization
- Security review
- Dependency audit
- Penetration testing
- Tenant-isolation validation
- Disaster recovery
- Backup and restore
- Queue failure recovery
- Monitoring
- Alerts
- Runbooks
- Full seed demo
- Production deployment
- Rollback rehearsal
- **Platform Ops (Super Admin — PRD §3 / Blueprint Phase 12):**
  - Suspend / resume tenant
  - Platform-forced module kill-switches
  - Plans and subscriptions
  - Cross-tenant health / ops views
  - Force revoke all tenant sessions
  - Tenant export / soft-delete / purge

## Production readiness checks

- Database backup tested
- Restore tested
- Migration rollback or forward-fix documented
- Redis failure behavior tested
- Notification retry tested
- Dead-letter queue visible
- Authentication rate limits enabled
- Secrets rotated
- Error tracking enabled
- Audit log retention configured
- Production smoke tests automated
- Suspended tenant cannot authenticate
- Platform-forced flags override tenant settings
- Plan/subscription assignment audited
- Export/delete runbook verified

---

# 11. Safe Parallel Development

Multiple developers should work against shared contracts rather than waiting for the entire module.

Example CRM split:

| Developer | Task |
|---|---|
| A | Lead schema and repository |
| B | Pipeline domain service |
| C | Lead list and details UI |
| D | Website and WhatsApp adapters |
| E | Follow-up worker |
| F | API and Playwright tests |

Recommended pull-request sequence:

```text
PR 1: RFC and shared contracts
PR 2: Schema and migration
PR 3: Repository layer
PR 4: Backend API
PR 5: Web UI
PR 6: Worker and events
PR 7: Complete E2E tests
PR 8: Feature flag activation
```

## Stacked pull requests

Use stacked PRs when necessary.

```text
PR A: Shared contracts
PR B: Backend implementation based on PR A
PR C: Web implementation based on PR A
```

After PR A merges:

```bash
git checkout feat/backend-crm
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Use `--force-with-lease`, never plain `--force`.

---

# 12. Pull Request Standard

Use the following pull-request template.

```markdown
## Issue

Closes CRM-142

## Purpose

Explain why the change is required.

## Scope

Describe what is included.

## Out of Scope

Describe what is intentionally not included.

## Database Changes

- Migration:
- Tables:
- Columns:
- Constraints:
- Indexes:
- Backfill:
- Tenant impact:

## API Changes

- POST /api/v1/...
- PATCH /api/v1/...

## Permissions

- crm.lead.create
- crm.lead.update

## Events and Jobs

- lead.created
- followup.due

## Test Evidence

- Unit:
- Repository:
- Integration:
- API E2E:
- Tenant isolation:
- Playwright:
- Flutter:

## UI Evidence

Add screenshots or video.

## Security Review

Describe tenant, RBAC, PII, financial, inventory, or audit impact.

## Rollout

- Feature flag:
- Deployment order:
- Rollback or forward-fix plan:

## Documentation

List updated documentation.
```

---

# 13. CI Pipeline

## Pull-request pipeline

```text
Checkout
→ Install and cache
→ Formatting check
→ Lint
→ ESLint check
→ Migration validation
→ Unit tests
→ Repository tests
→ Integration tests
→ Tenant-isolation tests
→ API E2E tests
→ Web build
→ Playwright tests
→ Worker tests
→ Flutter analyze and tests when affected
→ Dependency scan
→ Secret scan
→ Container build
→ Preview deployment
→ Preview smoke test
```

## Main-branch pipeline

```text
Merge to main
→ Build immutable artifacts
→ Deploy staging
→ Run tenant migrations
→ Run staging seed or fixtures
→ Run API smoke tests
→ Run Playwright smoke tests
→ Product approval if required
→ Deploy production
→ Run production smoke tests
→ Monitor errors and jobs
```

## Merge-blocking checks

The following must block merges:

- Formatting
- Lint
- Type errors
- Unit tests
- Migration validation
- Cross-tenant isolation
- Authentication tests
- Payment idempotency
- Inventory transaction tests
- Required API E2E tests
- Required code-owner approvals
- Security scan for critical findings

---

# 14. Environment Strategy

Use separate environments.

| Environment | Purpose |
|---|---|
| Local | Individual development |
| PR Preview | Pull-request review |
| Staging | Integrated production-like testing |
| Production | Customer-facing system |

Each environment must have separate:

- PostgreSQL database or isolated database branch
- Redis
- Object-storage prefix
- Notification credentials
- Encryption keys
- JWT keys
- OpenAI limits
- Feature flags
- WebSocket endpoint
- Logging configuration

PR previews must never use production databases or production notification credentials.

---

# 15. Feature Flag Strategy

Recommended feature-flag states:

```text
OFF
INTERNAL
TENANT_ALLOWLIST
PERCENTAGE_ROLLOUT
ON
```

Example rollout:

```text
crm.pipeline.enabled = INTERNAL
crm.pipeline.enabled = TENANT_ALLOWLIST
crm.pipeline.enabled = 10%
crm.pipeline.enabled = 50%
crm.pipeline.enabled = ON
```

Feature flags should support controlled rollback without reverting the deployment.

---

# 16. Testing Pyramid

## Unit tests

Test:

- State machines
- Calculations
- Permission logic
- Validators
- Domain rules
- Event payloads
- Idempotency helpers

## Repository tests

Test:

- Database operations
- Unique constraints
- Tenant context
- Transactions
- Soft deletes
- Index behavior
- Query filtering

## Integration tests

Test:

- API + database
- Worker + Redis
- Event handling
- Object storage
- Notification adapters
- Authentication

## E2E tests

Test full workflows:

```text
UI
→ API
→ Database
→ Event
→ Worker
→ Result
```

## Mandatory specialized suites

- Cross-tenant isolation
- Payment idempotency
- Inventory atomicity
- RBAC scope
- Refresh-token rotation
- Customer ownership
- Signed-document access
- Offline mobile synchronization

---

# 17. Professional Definition of Done

A feature is complete only when:

- Acceptance criteria pass.
- RFC or design is approved.
- Shared contracts are updated.
- Schema and migration are reviewed.
- API is implemented.
- RBAC is implemented.
- Tenant isolation is tested.
- Audit logging exists.
- UI is complete where required.
- Mobile behavior is complete where required.
- Loading, empty, and error states exist.
- Unit tests pass.
- Integration tests pass.
- E2E tests pass.
- Seed data demonstrates the workflow.
- Events and workers are tested.
- Monitoring is added.
- Documentation is updated.
- Feature flag exists.
- Rollback or forward-fix plan exists.
- QA approves.
- Product owner approves.

---

# 18. Daily Team Workflow

## Developer workflow

1. Select a ready GitHub Issue.
2. Confirm acceptance criteria.
3. Create a branch from current `main`.
4. Add or update tests.
5. Implement the smallest complete change.
6. Rebase regularly.
7. Open a draft PR early.
8. Request review when CI passes.
9. Resolve all comments.
10. Merge through the merge queue.
11. Verify staging after merge.
12. Close or update linked issues.

## Daily stand-up format

Each developer reports:

```text
Completed:
Current:
Blocked:
PR:
Risk:
Help needed:
```

## Weekly architecture review

Review:

- New RFCs
- Database migrations
- Shared contracts
- Security-sensitive changes
- Performance risks
- Cross-module dependencies
- Decisions requiring `DECISIONS.md`

---

# 19. Release Management

Recommended release format:

```text
v0.1.0 — Foundations
v0.2.0 — Identity and Project Structure
v0.3.0 — CRM
v0.4.0 — Construction Progress
v0.5.0 — Payment Engine and Customer Portal
v0.6.0 — Inventory and Procurement
v0.7.0 — Accounting
v0.8.0 — Dashboards
v0.9.0 — AI and HRMS
v1.0.0 — Mobile, Hardening, Production
```

Use GitHub Releases with:

- Included issues
- Included PRs
- Migrations
- Feature flags
- Known limitations
- Deployment instructions
- Rollback instructions
- Test evidence

---

# 20. Immediate Setup Checklist

## Repository

- [ ] Protect `main`
- [ ] Enable squash merge
- [ ] Enable merge queue
- [ ] Enable branch deletion
- [ ] Add `CODEOWNERS`
- [ ] Add PR template
- [ ] Add issue templates
- [ ] Add GitHub Project
- [ ] Add release labels
- [ ] Add phase labels
- [ ] Add module labels

## CI

- [ ] Formatting
- [ ] Lint
- [ ] ESLint
- [ ] Unit tests
- [ ] Integration tests
- [ ] Tenant-isolation tests
- [ ] API E2E
- [ ] Playwright
- [ ] Flutter tests
- [ ] Migration checks
- [ ] Dependency scanning
- [ ] Secret scanning
- [ ] Preview deployment

## Documentation

- [ ] `README.md`
- [ ] `CONTRIBUTING.md`
- [ ] `DECISIONS.md`
- [ ] `CODEOWNERS`
- [ ] `docs/data-model.md`
- [ ] `docs/architecture/`
- [ ] `docs/rfc/`
- [ ] `docs/runbooks/`
- [ ] `docs/testing/`

## Team

- [ ] Assign module owners
- [ ] Assign reviewers
- [ ] Define review SLA
- [ ] Define emergency hotfix process
- [ ] Define release owner
- [ ] Define migration approvers
- [ ] Define security approvers

---

# 21. Final Operating Principle

Each team should work independently inside clear module boundaries, but all teams must integrate continuously through shared contracts, short-lived branches, automated tests, reviewed migrations, feature flags, and a protected `main` branch.

The project should never measure progress only by the number of backend endpoints or UI pages completed.

Real progress means that a complete business workflow works end to end:

```text
User action
→ Permission check
→ Tenant-scoped API
→ Domain rule
→ Database transaction
→ Audit record
→ Domain event
→ Worker
→ Notification or dependent result
→ UI confirmation
→ Automated proof
```

That is the Git-centric delivery model that allows multiple developers to build a large ERP together without losing quality, traceability, or control.
