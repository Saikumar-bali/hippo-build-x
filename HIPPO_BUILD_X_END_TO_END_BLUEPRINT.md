# Hippo Build X — End-to-End Construction ERP Build Blueprint
**Repository:** `Saikumar-bali/hippo-build-x`  
**Purpose:** Canonical implementation plan for building the project safely, phase by phase, from foundation to production.
## Product vision
```text
Lead → Booking → Agreement → Customer → Construction Progress → Progress-Linked Billing → Receipt → Handover
```
The core differentiator is the deterministic chain from approved construction progress to an idempotent demand letter, customer notification, receipt and complete audit trail.
## Canonical architecture
- Next.js App Router for web UI and versioned `/api/v1` routes.
- Dedicated BullMQ worker for persistent, retryable jobs.
- Optional standalone WebSocket service or managed realtime provider.
- Flutter mobile app for employee, engineer, sales and customer roles.
- PostgreSQL schema-per-tenant with a shared control plane.
- Redis for queues, pub/sub and caching.
- S3/R2 for private documents and photos.
## Non-negotiable rules
- Tenant isolation is a correctness requirement.
- Money and stock changes are deterministic and transactional.
- AI cannot commit financial, stock or pipeline changes.
- Every state change is audited.
- Sensitive jobs and events are idempotent.
- Web and mobile share one versioned API.
- A phase is complete only after its end-to-end scenario and exit tests pass.

## Master phase roadmap
| Phase | Scope | Required proof |
|---:|---|---|
| 0 | Foundation and Architecture Stabilization | One tenant can be provisioned end to end without manual SQL, and the isolation suite blocks merges. |
| 1 | Identity, Sessions, RBAC, Tenant Admin + Platform login | All protected APIs use real auth; tenant admin works; platform super admin can sign in and create tenants. |
| 2 | Property, Projects and Planning | A real project can be fully represented, and its unit availability can safely support bookings. |
| 3 | CRM, Bookings and Customer Conversion | A lead can become a booked customer with agreement, KYC, portal identity and payment plan. |
| 4 | Construction Progress and Notification Core | Approved site progress updates customer-visible data and emits one reliable event for downstream billing. |
| 5 | Payment-vs-Progress Engine and Customer Portal | The event → demand → PDF → dispatch → receipt → audit chain works end to end and passes the mandatory idempotency suite. |
| 6 | Inventory and Procurement | Inventory, procurement and project consumption reconcile without negative or duplicated stock. |
| 7 | Operational Accounting | Finance can reconcile customer receivables, vendor payables and project costs with an auditable operational ledger. |
| 8 | Role-Based Dashboards | Every major role can operate from accurate, scoped dashboards backed by real modules. |
| 9 | AI Copilot and Grounded Customer Chatbot | AI is useful and traceable but technically unable to approve, post or mutate controlled business records. |
| 10 | HRMS | Attendance, leave and payroll work from capture to locked payslip with audit evidence. |
| 11 | Flutter Mobile Application | All four role experiences work against production-compatible APIs, including flaky-connection scenarios. |
| 12 | Hardening, Platform Ops, Observability and Production Launch | Production monitoring, **platform tenant lifecycle/ops/plans**, security, recovery and launch gates are complete. |

### Super Admin capability → phase map (canonical; matches PRD §3)

| Super Admin capability | Phase | Notes |
|---|---|---|
| Provision tenant (create schema, seed admin) | **0** | Platform APIs; may use service key until Phase 1 login |
| Platform super-admin login + create/list tenants UI | **1** | Control-plane `platform_users`; JWT `scope=platform` |
| Tenant-owned feature flags / branding / channels | **1** | Configured by **Tenant Admin**, not forced by platform |
| Suspend / resume tenant (full pause) | **12** | Blocks all tenant logins and tenant APIs |
| Platform-forced module kill-switches | **12** | Overrides tenant feature flags |
| Manage plans & subscriptions | **12** | Control-plane `plans` / `subscriptions` |
| Monitor cross-tenant health & ops views | **12** | Queue, errors, provisioning, readiness per tenant |
| Tenant export / soft-delete / purge processes | **12** | Legal hold, offboarding, verified deletion |
| Force revoke all tenant sessions | **12** | Incident response |

> Rule: PRD Super Admin jobs that are not listed under Phase 0 or 1 **must** ship in Phase 12. Do not invent an unscheduled Phase 1b unless DEC supersedes this map.

## Phase 0 — Foundation and Architecture Stabilization

**Goal:** Create a safe, consistent base that every later module can use without tenant leakage or infrastructure ambiguity.

### Deliverables
- Supersede conflicting architecture documents and record one canonical decision in docs/DECISIONS.md.
- Restore CI and add PostgreSQL/Redis test services.
- Create the control-plane schema and versioned tenant-schema migrations (include `tenants` with lifecycle statuses `provisioning|active|failed|suspended`, and stubs/columns reserved for later `platform_users`, `plans`, `subscriptions`, `feature_flags`).
- Implement tenant provisioning, retry and rollback/forward-fix paths (**Super Admin: provision tenants**).
- Create request-scoped tenant context and prohibit global business queries.
- Add standard response envelopes, errors, correlation IDs and structured logging.
- Add real health/readiness probes and a demonstration seed tenant.
- Add mandatory cross-tenant isolation tests.

### Explicitly out of Phase 0
- Platform super-admin password login UI (Phase 1).
- Suspend/resume, plans/subscriptions, forced module flags, export/deletion (Phase 12).

### Core endpoints
```text
GET /api/v1/health
GET /api/v1/health/ready
POST /api/v1/platform/tenants
GET /api/v1/platform/tenants/:id
POST /api/v1/platform/tenants/:id/retry-provisioning
```

### End-to-end scenario
1. A platform administrator creates Green Valley Developers.
2. The control plane stores the tenant as provisioning and enqueues tenant.provision.
3. The worker creates tenant_green_valley and applies every tenant migration.
4. Default roles, permissions and the initial administrator are seeded.
5. The tenant becomes active and the administrator receives an activation link.
6. Repeating the job does not duplicate schemas, users or migration records.

### Mandatory tests
- Tenant A can never read or write Tenant B data.
- Provisioning and retry are idempotent.
- A failed migration prevents readiness.
- A repository call without tenant context fails.
- PostgreSQL or Redis outage is reflected by readiness.

### Exit gate
One tenant can be provisioned end to end without manual SQL, and the isolation suite blocks merges.

## Phase 1 — Identity, Sessions, RBAC and Tenant Administration

**Goal:** Replace demonstration tokens with secure identity; enforce tenant, role, project and location access; enable authenticated platform super-admin provisioning.

### Deliverables
- Password login with Argon2id hashes (tenant users + **platform super admin**).
- Short-lived access tokens and rotating refresh tokens.
- HttpOnly secure cookies for web and secure storage for Flutter.
- Session revocation, logout, account suspension and password reset (**user** suspension, not tenant suspension).
- Four-axis RBAC and editable tenant permission matrix.
- User project/location assignments.
- Tenant branding, **tenant-owned** feature flags and encrypted channel configuration.
- Seeded `platform_users` super admin; platform login; authenticated create/list tenants.
- Audit interceptor for every state-changing API.

### Explicitly out of Phase 1
- Suspend/resume tenant, platform-forced kill-switches, plans/subscriptions, cross-tenant health ops, export/deletion (**Phase 12**).

### Core endpoints
```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET /api/v1/auth/me
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/platform/auth/login
GET /api/v1/platform/auth/me
POST /api/v1/platform/auth/logout
GET|POST /api/v1/platform/tenants
GET|POST /api/v1/admin/users
GET|POST /api/v1/admin/roles
GET|PATCH /api/v1/admin/branding
GET|PATCH /api/v1/admin/channel-config
GET /api/v1/admin/audit
```

### End-to-end scenario
1. Platform super admin signs in and (if needed) creates Green Valley Developers.
2. Tenant admin creates Meera as a site engineer.
3. Meera is assigned only to Green Valley Residency and Tower A.
4. Meera can submit Tower A progress but cannot approve her own update, view finance or access another project.

### Mandatory tests
- Invalid password fails without leaking account existence.
- Deleted or suspended user tokens fail immediately.
- A rotated refresh token cannot be reused.
- Auditor write requests are denied.
- Project and location scopes affect records and dashboards.
- Platform routes reject unauthenticated callers; platform login can create a tenant.

### Exit gate
All protected APIs use real authentication and permission enforcement; every write produces an audit record; platform super admin can sign in and provision tenants.

## Phase 2 — Property, Projects and Planning

**Goal:** Model the physical construction hierarchy and the practical execution plan used by CRM, progress, billing and costing.

### Deliverables
- Project, block, tower, floor, unit and unit-category masters.
- Bulk unit generation with uniqueness controls.
- Audited unit status history.
- Milestones, tasks, finish-to-start dependencies and basic Gantt data.
- BOQ, drawings, RFIs, issues, approvals and project budgets.
- Project/location scoped lists and permissions.

### Core endpoints
```text
GET|POST /api/v1/projects
GET|PATCH|DELETE /api/v1/projects/:id
POST /api/v1/projects/:id/generate-units
GET /api/v1/projects/:id/units
GET /api/v1/units/:id
PATCH /api/v1/units/:id/status
GET|POST /api/v1/projects/:id/tasks
POST /api/v1/tasks/:id/dependencies
GET|POST /api/v1/projects/:id/boq
POST /api/v1/projects/:id/drawings
POST /api/v1/projects/:id/rfis
POST /api/v1/projects/:id/issues
```

### End-to-end scenario
1. Admin creates Green Valley Residency with Tower A and Tower B.
2. Bulk generation creates floors 1–10 and standard 2BHK/3BHK units.
3. A unit status change from available to reserved is audited and immediately affects availability.

### Mandatory tests
- Duplicate unit coordinates are rejected.
- Task dependency cycles are rejected.
- Reserved or sold units cannot be silently overwritten.
- Drawing versions remain immutable.
- Unassigned users cannot access a project.

### Exit gate
A real project can be fully represented, and its unit availability can safely support bookings.

## Phase 3 — CRM, Bookings and Customer Conversion

**Goal:** Build the complete lead-to-customer journey with explicit state transitions and transactional unit booking.

### Deliverables
- Lead sources, activities, assignments, scoring fields and follow-ups.
- Pipeline state machine and invalid-transition errors.
- Website, WhatsApp and at least one advertising ingestion adapter.
- Site visits, reminders, booking approval and cancellation.
- KYC encryption, agreement upload and customer conversion.
- Customer account provisioning and unit/payment-plan linkage.

### Core endpoints
```text
GET|POST /api/v1/crm/leads
GET|PATCH|DELETE /api/v1/crm/leads/:id
POST /api/v1/crm/leads/:id/assign
POST /api/v1/crm/leads/:id/transition
POST /api/v1/crm/leads/:id/activities
POST /api/v1/crm/leads/:id/follow-ups
POST /api/v1/crm/bookings
POST /api/v1/crm/bookings/:id/approve
POST /api/v1/crm/bookings/:id/cancel
POST /api/v1/crm/bookings/:id/convert-customer
POST /api/v1/customers/:id/kyc
POST /api/v1/customers/:id/agreements
```

### End-to-end scenario
1. Ramesh enters through a website enquiry and is assigned to Priya.
2. Priya records follow-up, site visit and negotiation activities.
3. Ramesh selects A-102; a transaction reserves the unit and creates the booking.
4. Approval, agreement and KYC convert him into a customer with portal access and a payment plan.

### Mandatory tests
- Illegal pipeline transitions fail.
- Double booking is prevented transactionally.
- Customer conversion is idempotent.
- KYC values are encrypted and masked.
- Follow-up reminders fire once.
- Customer account links only to the correct tenant and unit.

### Exit gate
A lead can become a booked customer with agreement, KYC, portal identity and payment plan.

## Phase 4 — Construction Progress and Notification Core

**Goal:** Capture trustworthy, approved site progress and turn it into reliable domain events and customer notifications.

### Deliverables
- Activity templates and weighted unit activities.
- Checklists, submissions, photos, inspections and rejection comments.
- Engineer/project-manager approval workflow.
- Deterministic weighted progress calculation.
- progress.updated event using an outbox.
- Notification templates, consent records, provider adapters and status logs.
- Retryable delivery callbacks and failure visibility.

### Core endpoints
```text
GET|POST /api/v1/projects/:id/activity-templates
GET /api/v1/units/:id/activities
POST /api/v1/units/:id/progress
POST /api/v1/progress/:id/photos
POST /api/v1/progress/:id/submit
POST /api/v1/progress/:id/approve
POST /api/v1/progress/:id/reject
GET /api/v1/notifications
GET /api/v1/notifications/templates
POST /api/v1/notifications/test
```

### End-to-end scenario
1. Site engineer completes the slab checklist and uploads photos.
2. Project manager approves the submission.
3. The unit’s weighted progress is recalculated in a transaction.
4. progress.updated is written to the outbox.
5. The worker sends the configured milestone notification after consent checks.

### Mandatory tests
- Rejected progress cannot change unit completion.
- Approval emits exactly one event.
- Duplicate approval is idempotent.
- Users cannot approve their own work unless policy allows it.
- Notification consent and tenant provider configuration are enforced.
- Transient failures retry and are observable.

### Exit gate
Approved site progress updates customer-visible data and emits one reliable event for downstream billing.

## Phase 5 — Payment-vs-Progress Engine and Customer Portal

**Goal:** Prove the core differentiator: construction progress deterministically creates the correct customer demand and receipt flow.

### Deliverables
- Payment plans, milestones and schedules.
- Rules engine consuming progress.updated.
- Unique demand-letter creation and idempotency constraints.
- Tenant-branded PDF generation.
- Email, WhatsApp and SMS dispatch.
- Receipts, reversals and operational ledger effects.
- OTP-based customer portal with signed document URLs.
- Realtime progress, demand and receipt updates.

### Core endpoints
```text
POST /api/v1/units/:id/payment-plans
GET /api/v1/units/:id/payment-schedule
GET /api/v1/demand-letters
GET /api/v1/demand-letters/:id
POST /api/v1/demand-letters/:id/resend
POST /api/v1/receipts
GET /api/v1/receipts/:id
POST /api/v1/receipts/:id/reverse
GET /api/v1/customer/me/units
GET /api/v1/customer/me/progress
GET /api/v1/customer/me/payment-schedule
GET /api/v1/customer/me/documents
```

### End-to-end scenario
1. Slab approval crosses a configured payment threshold.
2. The rule engine verifies the milestone is eligible and not already demanded.
3. One demand letter is created and a PDF job is queued.
4. The customer receives approved channels and sees the demand in the portal.
5. Finance records a receipt; the schedule and portal update in realtime.

### Mandatory tests
- Repeated progress events create exactly one demand letter.
- PDF and notification failures retry without duplicate demands.
- A customer cannot access another customer’s unit or document.
- Signed URLs expire.
- Receipt reversal creates compensating records.
- No AI code path can create or modify a demand or receipt.

### Exit gate
The event → demand → PDF → dispatch → receipt → audit chain works end to end and passes the mandatory idempotency suite.

## Phase 6 — Inventory and Procurement

**Goal:** Control materials, warehouses, stock transactions and vendor purchasing with atomic quantities and project costing links.

### Deliverables
- Material and warehouse masters.
- Immutable stock transaction ledger.
- GRN, issue, consumption, transfer, return and adjustment workflows.
- Reorder levels, low-stock alerts, ABC and dead-stock reports.
- Vendor, RFQ, quotation, PO, invoice, payment and vendor scoring.
- Project/unit/location dimensions on consumption.

### Core endpoints
```text
GET|POST /api/v1/materials
GET|POST /api/v1/warehouses
GET /api/v1/stock
POST /api/v1/grns
POST /api/v1/material-issues
POST /api/v1/stock-transfers
POST /api/v1/stock-returns
GET|POST /api/v1/vendors
POST /api/v1/rfqs
POST /api/v1/rfqs/:id/quotations
POST /api/v1/purchase-orders
POST /api/v1/purchase-orders/:id/approve
POST /api/v1/purchase-orders/:id/receive
```

### End-to-end scenario
1. A project requests 500 cement bags while only 200 are available.
2. A shortage alert leads to RFQ, quotation selection and PO approval.
3. GRN posts 500 bags and stock becomes 700.
4. Issuing 500 bags to the project leaves 200 and updates project consumption cost.

### Mandatory tests
- Stock cannot become negative unless explicitly enabled.
- Transfers are atomic.
- GRN posting is idempotent.
- PO and tolerance overrides require permission.
- Every stock mutation has an immutable transaction and audit record.
- Low-stock alerts do not spam repeated notifications.

### Exit gate
Inventory, procurement and project consumption reconcile without negative or duplicated stock.

## Phase 7 — Operational Accounting

**Goal:** Provide reliable receivables, payables, receipts, project costing and reconciliation without claiming full statutory accounting.

### Deliverables
- Operational chart of accounts and immutable ledger entries.
- Customer invoices/receipts and vendor invoices/payments.
- Bank imports and reconciliation.
- Cost centres, project cost, budget-vs-actual and GST fields.
- Reversal instead of editing posted records.
- Exports for finance review.

### Core endpoints
```text
GET /api/v1/finance/ar
GET /api/v1/finance/ap
POST /api/v1/finance/vendor-invoices
POST /api/v1/finance/vendor-payments
GET /api/v1/finance/ledger
GET /api/v1/finance/project-costs
GET /api/v1/finance/budgets
POST /api/v1/finance/bank-imports
POST /api/v1/finance/reconciliations
```

### End-to-end scenario
1. A vendor invoice is matched to the PO and GRN.
2. Finance posts payment and operational ledger effects with project/cost-centre tags.
3. Material consumption and vendor invoices contribute to project cost versus budget.

### Mandatory tests
- Posted transactions are immutable.
- Reversal balances the original operational effect.
- Receipts reconcile to demands and customers.
- Vendor invoices follow matching policy.
- GST fields export correctly.
- Finance data remains tenant and permission scoped.

### Exit gate
Finance can reconcile customer receivables, vendor payables and project costs with an auditable operational ledger.

## Phase 8 — Role-Based Dashboards

**Goal:** Give each persona a decision-ready home screen using real, scoped module data.

### Deliverables
- CEO, Sales, Project, Procurement, Finance, HR and Customer dashboards.
- Project/location/role scoped aggregates.
- Links from every metric to source records.
- Cached or precomputed expensive aggregates.
- Clear empty, loading and error states.

### Core endpoints
```text
GET /api/v1/dashboards/ceo
GET /api/v1/dashboards/sales
GET /api/v1/dashboards/project
GET /api/v1/dashboards/procurement
GET /api/v1/dashboards/finance
GET /api/v1/dashboards/hr
GET /api/v1/dashboards/customer
```

### End-to-end scenario
1. A project manager sees progress, delays, inspections, material shortages and pending approvals for assigned projects only.
2. A CEO sees tenant-wide revenue, bookings, collections, costs and risks.
3. A customer sees only their own unit, schedule and documents.

### Mandatory tests
- Role determines visible widgets.
- Dashboard totals reconcile with list endpoints.
- Project/location scope changes totals.
- No dashboard query leaks cross-tenant data.

### Exit gate
Every major role can operate from accurate, scoped dashboards backed by real modules.

## Phase 9 — AI Copilot and Grounded Customer Chatbot

**Goal:** Add suggestions and grounded answers while keeping AI outside financial, stock and pipeline commit paths.

### Deliverables
- Provider-agnostic AiService.
- Per-tenant usage and budget controls.
- Lead, delay, shortage, collection and margin suggestions.
- Grounded customer chatbot using only authorized tenant/customer records.
- Prompt metadata, model, tokens, latency and cost logs.
- Confidence and AI-generated labels.
- Architectural and automated guardrails for prohibited actions.

### Core endpoints
```text
POST /api/v1/ai/leads/:id/summarize
POST /api/v1/ai/leads/:id/recommend
POST /api/v1/ai/projects/:id/risk
POST /api/v1/ai/finance/forecast
POST /api/v1/customer/chat
```

### End-to-end scenario
1. AI summarizes a lead and suggests the next follow-up.
2. The sales user chooses whether to apply the suggestion.
3. The customer asks for payment status; retrieval is limited to the customer’s own unit and documents.

### Mandatory tests
- Blocked actions always fail.
- Predictions never mutate business rows.
- Customer grounding cannot cross identity or tenant scope.
- Usage limits are enforced.
- Uncertain or unsupported answers are labeled or refused.

### Exit gate
AI is useful and traceable but technically unable to approve, post or mutate controlled business records.

## Phase 10 — HRMS

**Goal:** Manage employees, contractors, attendance, leave, payroll and documents with mobile and biometric integration paths.

### Deliverables
- Employee and contractor masters.
- GPS/timestamp attendance and labour attendance.
- Biometric CSV/webhook import contract.
- Leave approval workflow.
- Salary structures, payroll run, payslips and period locking.
- Performance, training and employee-document vault.

### Core endpoints
```text
GET|POST /api/v1/hr/employees
POST /api/v1/hr/attendance/check-in
POST /api/v1/hr/attendance/check-out
POST /api/v1/hr/attendance/import
GET|POST /api/v1/hr/leave
POST /api/v1/hr/leave/:id/approve
POST /api/v1/hr/payroll-runs
POST /api/v1/hr/payroll-runs/:id/calculate
POST /api/v1/hr/payroll-runs/:id/finalize
GET /api/v1/hr/payslips/:id
```

### End-to-end scenario
1. An employee checks in from Flutter while connectivity is poor.
2. The request queues locally and syncs with an idempotency key.
3. Approved leave affects attendance.
4. Payroll calculates and locks the month, then generates payslip PDFs.

### Mandatory tests
- Duplicate attendance is prevented.
- Offline sync is idempotent.
- Leave affects payroll correctly.
- Finalized payroll cannot be edited.
- Employees see only their own payslips and permitted documents.

### Exit gate
Attendance, leave and payroll work from capture to locked payslip with audit evidence.

## Phase 11 — Flutter Mobile Application

**Goal:** Deliver role-aware employee, site engineer, sales and customer experiences against the same versioned API.

### Deliverables
- Canonical /api/v1 client and environment-based base URLs.
- Secure token storage and refresh.
- Role-aware navigation and shells.
- Offline mutation queue, retries and visible sync status.
- Independent retry for photos and documents.
- Conflict rules that block unsafe automatic merges for approvals, stock and money.

### Core endpoints
```text
Uses the same /api/v1 endpoints as web; no separate mobile-only business API.
```

### End-to-end scenario
1. A site engineer records progress and photos offline.
2. On reconnection, metadata syncs idempotently and files retry independently.
3. The manager sees the submission and approves it on web.
4. The engineer receives realtime status.

### Mandatory tests
- Token refresh and logout clear secure credentials.
- Offline submission does not duplicate records.
- Photo upload resumes after failure.
- Role navigation hides unauthorized features.
- Customer data isolation matches web.

### Exit gate
All four role experiences work against production-compatible APIs, including flaky-connection scenarios.

## Phase 12 — Hardening, Platform Ops, Observability and Production Launch

**Goal:** Move from feature-complete to operationally safe, supportable and recoverable — including the remaining **Super Admin** control-plane jobs from the PRD.

### Deliverables
- Staging and production CI/CD with manual production approval.
- Automated backups and a verified restore drill.
- Migration, rollback/forward-fix and incident runbooks.
- Structured logs, tracing, error tracking and queue dashboards.
- WAF/rate limiting, dependency, secret and security scans.
- Load tests, index/query-plan review and performance budgets.
- **Platform Ops (Super Admin — aligns with PRD §3):**
  - Suspend / resume tenant (full service pause; rejects tenant auth when `status=suspended`)
  - Platform-forced module kill-switches (override tenant feature flags)
  - Plans and subscriptions CRUD + assign plan to tenant
  - Cross-tenant health / ops views (provisioning, queues, error rates)
  - Force revoke all sessions for a tenant
  - Tenant export and soft-delete / purge processes with audit evidence
- Production launch checklist and support documentation.

### Core endpoints
```text
Health/readiness, worker heartbeat, WebSocket heartbeat and protected operational status endpoints.
PATCH /api/v1/platform/tenants/:id/status          # active | suspended
PATCH /api/v1/platform/tenants/:id/feature-flags  # platform-forced flags
GET|POST|PATCH /api/v1/platform/plans
GET|POST|PATCH /api/v1/platform/subscriptions
GET /api/v1/platform/tenants/:id/health
POST /api/v1/platform/tenants/:id/revoke-sessions
POST /api/v1/platform/tenants/:id/export
POST /api/v1/platform/tenants/:id/delete
```

### End-to-end scenario
1. A release backs up data, validates migrations, deploys compatible workers, applies migrations, deploys web/API and runs smoke tests.
2. Alerts monitor error rates, failed jobs, queue backlog and notification failures.
3. A restore drill proves recovery.
4. Super admin suspends a delinquent tenant → tenant logins fail → resume restores access.
5. Super admin forces `payments=false` for a tenant under incident response; tenant admin cannot re-enable until platform clears the override.
6. Super admin assigns a plan/subscription and exports then soft-deletes a departing tenant with audited evidence.

### Mandatory tests
- Isolation, payment idempotency, inventory atomicity, auth rotation and audit completeness suites are mandatory.
- Staging E2E passes before production approval.
- Backup restore is verified.
- No critical dependency vulnerabilities remain.
- Suspended tenant cannot authenticate or call tenant APIs.
- Platform-forced flags override tenant settings.
- Plan/subscription assignment is auditable.
- Export/delete leaves no active schema leakage across tenants.

### Exit gate
Production monitoring, security controls, recovery evidence, **complete Super Admin platform ops**, and launch gates are complete.

## Cross-cutting implementation standards
### Tenant request context
```js
{ tenantId, schemaName, userId, roles, permissions, projectIds, locationIds, correlationId }
```
### Domain event envelope
```js
{ eventId, type, version, tenantId, actorId, correlationId, occurredAt, payload }
```
### Mandatory event catalogue
```text
tenant.provisioned
lead.created
lead.stage_changed
booking.approved
customer.created
progress.approved
progress.updated
payment.milestone_eligible
payment.demanded
receipt.recorded
stock.received
stock.issued
stock.low
purchase_order.approved
payroll.finalized
notification.sent
notification.failed
```
### Transaction boundaries
Use database transactions for booking and reservation, customer conversion, progress approval and recalculation, demand creation, receipt/ledger posting, GRN, stock issue/transfer, payroll finalization and role assignment. Never call external providers inside an open transaction; write an outbox event instead.
### Mandatory test suites
```text
cross-tenant-isolation
payment-idempotency
inventory-atomicity
auth-token-rotation
audit-completeness
customer-document-isolation
```
### Definition of Done
A module is complete only when it includes schema, migration, seed data, domain rules, repository/service/API, permissions, audit behavior, events/jobs, web UI, mobile support where relevant, unit/integration/E2E tests, isolation proof, documentation and operational error states.
## Immediate next branch
```text
feat/phase-0-tenant-foundation
```
Limit the branch to architecture stabilization, CI, worker/realtime scaffolding, tenant provisioning/migrations, request-scoped tenant context, removal of global business queries, isolation tests, readiness checks and one-command local setup. Do not expand CRM or redesign the UI in this branch.
