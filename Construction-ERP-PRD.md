# Construction Management ERP — Product Requirements Document (Coding-Agent Build Brief)

**Document type:** Build-ready PRD for an autonomous coding agent
**Product:** Multi-Tenant, AI-assisted Construction ERP (SaaS)
**Version:** 1.0 (draft for build)
**Audience:** The coding agent implementing the system, plus the human reviewer approving each phase.

---

## 0. How to use this document (read first, agent)

This PRD is the contract. Build strictly against it. When a detail is unspecified, prefer the **conventions in §11–§14** over inventing new patterns, and record the assumption in a `DECISIONS.md` at the repo root rather than asking mid-build.

Rules for the agent:

1. **Build phase by phase (§15).** Do not start a later phase until the prior phase's Definition of Done is met and committed.
2. **Never write a schema migration that a human hasn't seen.** Migrations are generated, checked in, and listed in the phase PR description.
3. **Tenant isolation is a correctness property, not a feature.** Any query that can read or write tenant data without a resolved tenant context is a bug. See §5.
4. **No AI output writes directly to money, inventory, or ledgers.** AI proposes; a human or a deterministic rule commits. See §9.
5. Every module ships with its data model, API, UI, tests, and seed data together. A module is not "done" if any of those is missing.

---

## 1. Problem statement & vision

Construction and real-estate development companies run their business across disconnected tools: spreadsheets for sales pipelines, separate accounting software, WhatsApp for customer updates, and paper or ad-hoc apps for site progress. The disconnect between **construction progress** and **customer billing** is the costliest gap — installments that should be raised when a slab is cast get raised late or never, and customers get no reliable visibility into what they paid for.

**Vision:** One platform that carries a unit from lead → sale → agreement → construction → billing → handover, where site progress automatically drives customer demand letters and notifications, and where each construction company operates as an isolated tenant with its own data, branding, and messaging channels.

---

## 2. Goals and non-goals

### 2.1 Goals (v1)

- **G1.** A construction company can run its full sales-to-handover lifecycle for at least one project without leaving the platform.
- **G2.** Construction progress recorded on site automatically triggers the correct customer installment demand, notification, and receipt flow, with a full audit trail.
- **G3.** Each tenant's data is physically isolated (schema-per-tenant) with its own users, roles, branding, and notification channel credentials.
- **G4.** Role-scoped dashboards give each persona (CEO, Sales, PM, Procurement, Finance, HR, Customer) a decision-ready view.
- **G5.** AI acts as an assistant across sales, construction risk, and customer support, but every AI action that has a financial or inventory effect is gated behind a deterministic rule or human approval.

### 2.2 Non-goals (v1) — do not build these now

- **N1. Payment gateway / money movement.** The system generates demand letters and records receipts; it does **not** collect card/UPI payments in v1. Design the payment schema so a gateway can be added later (P2). *Rationale: regulatory and PCI scope; out of scope for first build.*
- **N2. Native drone/CAD tooling.** Drone and drawing images are *uploaded and displayed*; no in-app CAD editing or photogrammetry. *Rationale: heavy, specialized, low first-value.*
- **N3. Full double-entry statutory accounting / audit-grade GST filing.** v1 provides operational accounting (AR/AP, invoices, receipts, project costing, GST fields, exports). Certified statutory filing and full ledger balancing are P1/P2. *Rationale: correctness bar is very high; scope it deliberately.*
- **N4. Marketplace / cross-tenant vendor network.** Vendors are per-tenant. *Rationale: avoids premature cross-tenant data model.*
- **N5. On-device biometric hardware drivers.** Biometric attendance integrates via a documented webhook/CSV contract, not by shipping device firmware. *Rationale: hardware-specific, deferrable.*

### 2.3 Explicit v1 module scope

In scope: Tenant/User/RBAC control plane · CRM · HRMS · Property & Project structure · Project Planning (lite) · Material & Inventory · Supplier/Procurement · Construction Progress · **Payment-vs-Progress engine** · Operational Accounting · Customer Portal · Role Dashboards · Notifications (WhatsApp/Email/SMS) · AI Copilot (assist-only) · Mobile apps (Employee, Site Engineer, Sales, Customer).

---

## 3. Personas & roles

| Role | Scope | Primary jobs |
|---|---|---|
| Super Admin | Platform (control plane) | Provision tenants, monitor health, manage plans |
| Tenant Admin | One tenant | Configure branding, users, roles, channels, projects |
| Project Manager | Project(s) | Planning, progress sign-off, budget, risk |
| Sales Manager / CRM Executive | Tenant / assigned leads | Pipeline, follow-ups, bookings |
| Procurement / Purchase | Tenant | RFQ, PO, vendor management |
| Store / Inventory | Warehouse(s) | GRN, issue, stock, transfers |
| Finance | Tenant | AR/AP, invoices, receipts, reconciliation |
| HR | Tenant | Employees, attendance, payroll, leave |
| Site Engineer | Assigned units/activities | Progress updates, checklists, inspections |
| Customer | Their unit(s) | Timeline, payments due, documents, support |
| Vendor / Contractor | Their POs / work | (Portal-lite, P1) quotations, delivery status |
| Auditor | Tenant (read-only) | Read-only access to records and trails |

Permissions are enforced along four axes: **role-based, module-based, project-based, location-based** (§6).

---

## 4. Tech stack & architecture decisions

Honoring the stack in the source brief, with concrete framework choices made for a large modular ERP. Each decision is flagged **[LOCKED]** (build against this) or **[OPEN]** (default chosen; human may override — record in `DECISIONS.md`).

### 4.1 Stack

- ~~**Web frontend [LOCKED]:** React 18 + TypeScript + **Vite**. UI library **Ant Design 5** (+ Ant Design ProComponents for tables/forms). Server state via **TanStack Query**; light client state via **Zustand**; routing via **React Router**. Charts via Ant Design Charts / Recharts.~~
- **Web frontend [LOCKED]:** Next.js 15 (App Router) + JavaScript (no TypeScript). UI library **Ant Design 5** (+ Ant Design ProComponents for tables/forms). Client state via **Zustand**; routing via Next.js file-based routing. Charts via Ant Design Charts.
- ~~**Backend [LOCKED framework: NestJS]:** Node.js + **NestJS** + TypeScript. NestJS is chosen over bare Express for first-class modules, dependency injection, guards/interceptors (ideal for the 4-axis RBAC), and pipes for validation. If the human prefers plain Express/Fastify, that is **[OPEN]** but the module boundaries in this doc still apply.~~
- **Backend [LOCKED]:** Next.js API Routes (`/api/v1/*`). Full-stack monolith — frontend and backend in one deployment. Separate worker process for background jobs.
- ~~**ORM [LOCKED]:** **Drizzle ORM** with `postgres-js`. Drizzle's explicit SQL and multi-connection model fit schema-per-tenant cleanly.~~
- **Database access [LOCKED]:** **pg** (node-postgres) with raw SQL queries. Direct PostgreSQL access without ORM abstraction.
- **Database [LOCKED]:** **PostgreSQL** (local or Neon). **Schema-per-tenant** isolation (§5). A shared `public` schema holds cross-tenant records (tenants, super-admin users, plans, provisioning jobs).
- **Background jobs / queue [LOCKED]:** **BullMQ on Redis** (separate worker process). Used for notifications, demand-letter generation, AI tasks, report builds, scheduled reminders.
- **Object storage [LOCKED]:** S3-compatible bucket, keyed per tenant (`s3://<bucket>/<tenantId>/...`). Signed URLs for access; no public buckets.
- **Realtime [LOCKED]:** Standalone WebSocket server (ws/socket.io) or managed service (Pusher/Ably) for progress/notification push to portals and dashboards.
- **AI [LOCKED]:** OpenAI (Agents/Responses API + function calling) behind an internal `AiService` abstraction so the provider can be swapped. See §9.
- **Mobile [LOCKED]:** **Flutter** (single codebase, role-aware app shells: Employee, Site Engineer, Sales, Customer). Offline-first for Employee/Site Engineer (§12).
- **Notifications [LOCKED]:** WhatsApp Business API (**Infobip or Meta Cloud API**, adapter pattern), Email (**Brevo**/SMTP), SMS (**Twilio** and **2Factor.in**). All credentials are **per-tenant** (§10).

### 4.2 Deployment topology **[OPEN — important]**

- ~~The source brief says "deployed in Vercel." That is correct for the **web frontend** (static React SPA on Vercel). The **NestJS API + BullMQ workers + WebSocket gateway** are stateful/long-running and are **not** a good fit for Vercel serverless. Default decision:~~
- **Web + API (Next.js):** Vercel, Railway, or container. Next.js handles both frontend and API routes.
- **Worker (BullMQ):** Separate process on same host or container host (Railway / Render / Fly.io).
- **WebSocket server:** Standalone process or managed service (Pusher/Ably).
- **Postgres:** Local or Neon. **Redis:** local or managed (Upstash/Redis Cloud). **Object store:** S3/R2.

### 4.3 High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js App (port 3000)                                        │
│  • Frontend: Ant Design 5 + App Router                          │
│  • Backend: API Routes (/api/v1/*)                              │
│  • AuthN (JWT) + AuthZ middleware (role/module/project/location)│
│  • Tenant resolver middleware → per-request DB context          │
│  • Domain modules (CRM, HRMS, Projects, Inventory, ... )        │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ queries                     │ enqueue
                ▼                             ▼
     ┌────────────────────┐        ┌────────────────────────┐
     │ PostgreSQL          │        │ Redis                  │
     │ control_plane +     │        │ BullMQ queue           │
     │ tenant_<id> schemas │        └───────────┬────────────┘
     └────────────────────┘                     │
                                       ┌────────▼────────┐
                                       │ Worker Process   │
                                       │ notifications,   │
                                       │ demand letters,  │
                                       │ AI, reports      │
                                       └────────┬────────┘
                                                │
                        ┌───────────────────────┼───────────────────────┐
                        ▼                       ▼                       ▼
                  WhatsApp adapter        Email (Brevo)           SMS (Twilio/2Factor)
                  (Infobip/Meta)                                  + OpenAI (AiService)

   Flutter apps (Employee, Site Engineer, Sales, Customer)
        │
        │ HTTPS / WSS
        ▼
   Same /api/v1/* endpoints as web
```

---

## 5. Multi-tenancy architecture **[LOCKED]**

**Isolation model: schema-per-tenant on a shared Neon database (with a path to database-per-tenant for large tenants at P2).**

### 5.1 Control plane vs tenant schemas

- `control_plane` schema (one, shared): `tenants`, `platform_users` (super admins), `plans`, `subscriptions`, `provisioning_jobs`, `tenant_channels` (encrypted per-tenant channel creds), `feature_flags`.
- `tenant_<tenantId>` schema (one per tenant): all business tables — users, roles, leads, projects, units, materials, POs, invoices, etc.

### 5.2 Tenant resolution (request lifecycle)

1. Client sends JWT (contains `tenantId`, `userId`, `roleIds`) and/or a tenant subdomain/header.
2. `TenantResolverMiddleware` validates the tenant is active and attaches a **request-scoped Drizzle client bound to `tenant_<id>` schema** (`SET search_path` / schema-qualified client).
3. All repositories resolve the tenant client from request context. **There is no default/global tenant client for business data.** A repository call without tenant context throws.

### 5.3 Provisioning

- Creating a tenant enqueues a `provisionTenant` job: create schema, run tenant migrations, seed default roles + permission matrix + admin user, create storage prefix, write `tenant_channels` row (empty until configured).
- Tenant migrations are versioned and applied to **every** tenant schema; a migration runner iterates active tenants. The runner is idempotent and records applied versions per schema.

### 5.4 Acceptance criteria (tenancy)

- [ ] A user authenticated for Tenant A can never read or write any row in Tenant B's schema through any endpoint (covered by an automated cross-tenant isolation test suite).
- [ ] Provisioning a new tenant yields a fully migrated schema + seeded admin who can log in, with zero manual SQL.
- [ ] A tenant migration adds a column to all existing tenant schemas and is recorded per-schema; re-running it is a no-op.
- [ ] Per-tenant channel credentials are encrypted at rest and never returned in plaintext via any API.

---

## 6. Security & RBAC **[LOCKED]**

### 6.1 AuthN

- JWT access tokens (short-lived) + refresh tokens (rotating, revocable). Passwords hashed with Argon2id.
- Customer and vendor portal logins are the same identity system, scoped by role. OTP login (via SMS/WhatsApp) allowed for Customer role.
- ~~*Note for [OPEN] full-stack variant:* if the app is rebuilt on Next.js, Better Auth is the preferred library; for the NestJS build, use Passport-JWT + a custom RBAC layer.~~
- **Implementation:** Next.js middleware with `jose` JWT library + custom RBAC middleware.

### 6.2 AuthZ — four-axis model

A permission check evaluates: **role** (what actions the role allows) ∧ **module** (feature enabled for tenant/plan) ∧ **project** (user assigned to project) ∧ **location** (user assigned to site/warehouse). ~~Implemented as a NestJS guard `@RequirePermission('crm.lead.update')` + a scope resolver that checks project/location assignment on the target resource.~~ Implemented as Next.js middleware + a scope resolver function that checks project/location assignment on the target resource.

- Permission matrix is data-driven (seeded per tenant, editable by Tenant Admin), not hardcoded in code paths.
- Auditor role = read-only across granted modules; every write endpoint denies Auditor.

### 6.3 Cross-cutting security

- All input validated via DTOs (`class-validator`); reject unknown fields.
- No secrets in logs; PII (Aadhaar/PAN/passport) encrypted at rest, masked in API responses, full value only to roles with `kyc.view.full`.
- Rate limiting on auth and OTP endpoints; audit log (§14.4) for every state-changing action.
- Signed, expiring URLs for all document/image access.

---

## 7. Core data model (canonical entities)

Below are the **canonical entities per module** (fields abbreviated; the agent expands with `id`, `createdAt`, `updatedAt`, `createdBy`, soft-delete `deletedAt` where relevant). All tenant entities live in the tenant schema; all carry an implicit tenant boundary via schema (no `tenantId` column needed inside a tenant schema, but keep one on control-plane mirrors).

**Control plane:** `Tenant`, `PlatformUser`, `Plan`, `Subscription`, `TenantChannel`, `ProvisioningJob`, `FeatureFlag`.

**Identity & access (tenant):** `User`, `Role`, `Permission`, `RolePermission`, `UserProjectAssignment`, `UserLocationAssignment`.

**CRM:** `Lead`, `LeadSource`, `LeadActivity`, `FollowUp`, `Campaign`, `Booking`, `Agreement`, `KycDocument`.

**HRMS:** `Employee`, `Contractor`, `Attendance`, `LabourAttendance`, `LeaveRequest`, `PayrollRun`, `Payslip`, `PerformanceReview`, `TrainingRecord`, `EmployeeDocument`.

**Property/Project:** `Project`, `Block`, `Tower`, `Floor`, `Unit` (villa/flat/plot), `UnitCategory`, `UnitStatusHistory`.

**Planning:** `Milestone`, `Task`, `TaskDependency`, `BoqItem`, `Rfi`, `Drawing`, `Issue`, `Approval`.

**Inventory:** `Material`, `Warehouse`, `StockLevel`, `Grn`, `MaterialIssue`, `Consumption`, `StockTransfer`, `StockReturn`, `StockAlert`.

**Procurement:** `Vendor`, `Rfq`, `Quotation`, `PurchaseOrder`, `PoLine`, `VendorInvoice`, `VendorPayment`, `VendorScore`.

**Construction progress:** `ActivityTemplate`, `UnitActivity`, `ActivityChecklist`, `ProgressUpdate`, `ProgressPhoto`, `Inspection`, `EngineerApproval`.

**Payments & billing:** `PaymentPlan`, `PaymentMilestone`, `DemandLetter`, `Invoice`, `Receipt`, `PaymentSchedule`, `LedgerEntry` (operational).

**Accounting:** `GlAccount`, `LedgerEntry`, `ArInvoice`, `ApInvoice`, `BankTransaction`, `Reconciliation`, `CostCenter`, `ProjectCost`, `Budget`, `GstRecord`.

**Notifications:** `NotificationTemplate`, `NotificationLog`, `ConsentRecord`.

**AI:** `AiInteraction`, `AiPrediction`, `AiSuggestion` (all assist-only, see §9).

**Audit:** `AuditLog`.

> The agent produces an ER diagram (Mermaid) in `/docs/data-model.md` as part of Phase 0 and keeps it current.

---

## 8. Module specifications

Each module below follows the same template: **Purpose · Key entities · Core features · Representative user stories · Acceptance criteria (P0) · AI hooks (assist-only).** Unless marked P1/P2, requirements are **P0 for that module's phase**.

### 8.1 CRM (Lead → Customer)

**Purpose:** Capture leads from all sources, move them through a defined pipeline to booking and agreement, and hand off to construction.

**Key entities:** `Lead`, `LeadSource`, `LeadActivity`, `FollowUp`, `Campaign`, `Booking`, `Agreement`, `KycDocument`.

**Pipeline (state machine):** `Lead → Qualified → Site Visit → Negotiation → Booking → Agreement → Customer → Construction → Possession`. Transitions are explicit and audited; illegal transitions are rejected.

**Core features:**
- Lead intake from: website form, Meta/Facebook Lead Ads, Instagram, Google Ads, LinkedIn, WhatsApp Business, property portals, broker/referral, walk-in, call center. Each source maps to an ingestion adapter that normalizes into `Lead`.
- Lead attributes: aging, score, probability, expected revenue, follow-up timeline, source, assigned executive.
- Activity timeline + reminder engine (follow-ups due surface on dashboards and push notifications).
- Sales funnel and team performance views.
- Booking → Agreement → digital signature (P1 for e-sign integration; v1 supports agreement upload + approval workflow + status) → payment plan attach → convert to Customer.
- Digital KYC capture (PAN, Aadhaar, passport, nominee, loan details) with encrypted storage.

**Representative user stories:**
- As a CRM Executive, I want new Meta lead-ad submissions to appear as leads automatically so that no inquiry is lost.
- As a Sales Manager, I want the pipeline funnel with conversion % by source so that I can reallocate spend.
- As a Sales Executive, I want reminders for due follow-ups so that leads don't go cold.

**Acceptance criteria (P0):**
- [ ] Webhook ingestion creates a `Lead` from at least: website form + one ads source + WhatsApp inbound, with source attribution.
- [ ] Pipeline transitions are enforced by a state machine; invalid transitions return a domain error.
- [ ] Converting a booking to a customer provisions the customer's portal access and links the unit.
- [ ] KYC fields are encrypted at rest and masked unless the caller holds `kyc.view.full`.
- [ ] Follow-up reminders fire via the notification pipeline at the scheduled time.

**AI hooks (assist-only):** conversion probability, best follow-up time, best-fit executive suggestion, lead temperature, likely budget band, predicted close date, drop-reason classification, next-best-action. All surface as **suggestions** on the lead; none auto-change pipeline stage or pricing.

---

### 8.2 HRMS

**Purpose:** Manage the workforce (employees, site engineers, contractors, labour) with attendance, leave, payroll, and documents.

**Key entities:** `Employee`, `Contractor`, `Attendance`, `LabourAttendance`, `LeaveRequest`, `PayrollRun`, `Payslip`, `PerformanceReview`, `TrainingRecord`, `EmployeeDocument`.

**Core features:** employee master; daily site attendance (mobile, GPS-stamped); labour attendance by contractor/site; biometric integration via **documented webhook/CSV contract** (not device firmware); leave workflow; payroll run + payslip generation; performance and training records; employee document vault; employee mobile app.

**User stories:**
- As HR, I want to run monthly payroll from attendance so that payslips are generated consistently.
- As a Site Engineer, I want to mark site attendance from my phone with GPS so that presence is verifiable.

**Acceptance criteria (P0):**
- [ ] Attendance can be captured via web and mobile (GPS + timestamp); duplicates for a day/user are prevented.
- [ ] A payroll run computes payslips from attendance + salary structure and locks the period.
- [ ] Biometric CSV/webhook import maps device punches to `Attendance` with a documented schema.
- [ ] Leave requests follow an approval workflow and reflect in attendance.

**AI hooks:** attrition risk, hiring-need signal (dashboards). Assist-only.

---

### 8.3 Property & Project structure

**Purpose:** Model the physical hierarchy and unit inventory that everything else references.

**Hierarchy:** `Company → Project → Block → Tower → Floor → Unit`. `Unit` is villa / flat / plot / commercial / office / warehouse, with `UnitCategory`. Unit `status`: Available, Reserved, Booked, Cancelled, Completed, Delivered — with `UnitStatusHistory`.

**Acceptance criteria (P0):**
- [ ] A tenant can create a project and generate its tower/floor/unit tree (bulk unit generation supported).
- [ ] Unit status changes are audited and drive availability views.
- [ ] A unit links cleanly to a booking, a customer, a payment plan, and its construction activities.

---

### 8.4 Project planning (lite)

**Purpose:** Plan and track project execution at a practical level for v1.

**Key entities:** `Milestone`, `Task`, `TaskDependency`, `BoqItem`, `Rfi`, `Drawing`, `Issue`, `Approval`, `Budget`.

**v1 scope:** project creation, milestones, tasks with dependencies, a **Gantt view (read + basic edit)**, BOQ, daily progress log, RFI, drawing register (upload/display), issues, approvals, project budget. **Critical-path computation is P1**; render dependencies and a Gantt in v1, compute CPM later.

**Acceptance criteria (P0):**
- [ ] Tasks support finish-to-start dependencies and render on a Gantt.
- [ ] BOQ items tie to a project and feed project costing.
- [ ] Drawings and RFIs are versioned and access-controlled.

---

### 8.5 Material & Inventory

**Key entities:** `Material`, `Warehouse`, `StockLevel`, `Grn`, `MaterialIssue`, `Consumption`, `StockTransfer`, `StockReturn`, `StockAlert`.

**Core features:** material master; multi-warehouse stock; GRN; issue; consumption; transfer; return; low-stock alerts; ABC analysis; dead-stock report.

**Acceptance criteria (P0):**
- [ ] Stock levels update correctly and atomically on GRN, issue, transfer, return (no negative stock unless explicitly allowed).
- [ ] Low-stock alerts fire via notifications when below reorder level.
- [ ] Consumption ties to a project/unit for costing.

**AI hooks:** material shortage prediction, purchase recommendation, price forecast (dashboards, assist-only).

---

### 8.6 Supplier / Procurement

**Key entities:** `Vendor`, `Rfq`, `Quotation`, `PurchaseOrder`, `PoLine`, `VendorInvoice`, `VendorPayment`, `VendorScore`.

**Core features:** vendor registration; RFQ → quotation → PO → invoice → payment; vendor performance score, rating, lead time. Vendor portal-lite (submit quotation, view PO status) is **P1**.

**Acceptance criteria (P0):**
- [ ] A PO can be raised from an RFQ/quotation, approved per RBAC, and received via GRN (links to inventory).
- [ ] Vendor score is computed from on-time delivery + quality inputs.

---

### 8.7 Construction progress

**Purpose:** Record real site progress at the unit/activity level, with engineer sign-off, and emit the events that drive customer notifications and billing.

**Hierarchy of work:** `Project → Tower → Floor → Unit → UnitActivity → Checklist → Engineer Approval → Customer Notification`.

**Key entities:** `ActivityTemplate` (e.g., Foundation, Columns, Slab, Brick, Electrical, Painting, Completed with default % weights), `UnitActivity`, `ActivityChecklist`, `ProgressUpdate`, `ProgressPhoto`, `Inspection`, `EngineerApproval`.

**Core features:** per-unit activity stages with completion %; checklist per activity; photo/drone-image upload; inspection records; **engineer approval is the authoritative event** that sets a unit's progress %. On approval, the system emits a `progress.updated` domain event → notification pipeline + payment engine (§8.8).

**Acceptance criteria (P0):**
- [ ] A site engineer updates an activity's completion, attaches photos, and submits; a PM/authorized engineer approves.
- [ ] Approval recomputes unit overall % from weighted activities and emits `progress.updated`.
- [ ] Customer receives the configured notification (e.g., "Slab completed") automatically on qualifying milestones.
- [ ] A unit progress dashboard shows stage, engineer, %, images, inspection, and customer-facing timeline.

**AI hooks:** project delay risk, completion-date estimate, weather-impact flag, budget-overrun risk (dashboards, assist-only).

---

### 8.8 Payment-vs-Progress engine (the core differentiator)

**Purpose:** Deterministically convert construction progress into the right customer billing action. **This is a rules engine, never an AI action.**

**Inputs:** `PaymentPlan` + `PaymentMilestone`s attached to a unit (each milestone gated on a construction threshold or activity), and `progress.updated` events.

**Rule (canonical example):**
```
WHEN unit.progress crosses a PaymentMilestone.threshold
 AND that milestone's installment is not yet demanded
 AND (customer payment for prior eligible milestones is not blocking, per plan config)
THEN create DemandLetter(installment)
     → render PDF (tenant-branded)
     → send Email + WhatsApp + SMS (per tenant channel config & consent)
     → set milestone.status = DEMANDED
     → log NotificationLog + AuditLog
```
Receipts are recorded against demand letters; the schedule view reconciles demanded vs received.

**Acceptance criteria (P0):**
- [ ] Crossing a payment milestone threshold generates exactly one demand letter (idempotent; no duplicates on repeated events).
- [ ] Demand letter renders as a tenant-branded PDF and dispatches over the tenant's configured channels, respecting consent.
- [ ] Recording a receipt updates the schedule and the customer portal in realtime.
- [ ] The entire chain (event → rule → demand → dispatch → receipt) is in the audit log and reproducible.
- [ ] **No AI component can create, alter, or send a demand letter or receipt.**

---

### 8.9 Operational accounting (v1 scope)

**Key entities:** `GlAccount`, `LedgerEntry`, `ArInvoice`, `ApInvoice`, `Receipt`, `VendorPayment`, `BankTransaction`, `Reconciliation`, `CostCenter`, `ProjectCost`, `Budget`, `GstRecord`.

**v1 scope:** AR (customer invoices/receipts), AP (vendor invoices/payments), GST fields on documents, bank reconciliation (manual/import), cash-flow view, budget vs actual, cost centers, project costing. **Full statutory double-entry balancing and certified GST filing are P1/P2 (N3).**

**Acceptance criteria (P0):**
- [ ] Every invoice/receipt/payment posts a corresponding operational `LedgerEntry` with project + cost-center tags.
- [ ] Project costing aggregates material consumption + vendor invoices + labour into per-project cost vs budget.
- [ ] GST fields captured on relevant documents and exportable.

**AI hooks:** cash-flow forecast, collection prediction, project margin, late-payment prediction (dashboards, assist-only).

---

### 8.10 Customer portal

**Purpose:** Give each customer a trustworthy view of their unit.

**Features:** construction timeline + photos, payment schedule & status, demand letters, agreement & invoices/receipts (download), support chat, notifications. OTP login supported.

**Acceptance criteria (P0):**
- [ ] A customer sees only their own unit(s) and documents (tenant + unit scoped).
- [ ] Progress and new demand letters/receipts appear in near-realtime.
- [ ] Documents download via signed, expiring URLs.

---

### 8.11 Role dashboards

Build role-scoped dashboards; each pulls only permitted data.

- **CEO:** revenue, projects, cash flow, bookings, collections, delayed projects, profit, AI recommendations.
- **Sales:** funnel, conversion, revenue, hot leads, campaign ROI, target.
- **Project:** progress, delay, milestones, labour, material, cost, weather, AI risk.
- **Procurement:** POs, pending GRN, supplier score, consumption, stock, forecast.
- **Finance:** cash flow, receivables, payables, budget, profit, GST.
- **HR:** attendance, payroll, leave, contractors, attrition, hiring.
- **Customer:** progress %, schedule, demand letters, documents, photos, timeline, support.

**Acceptance criteria (P0):** each dashboard renders from real module data, respects the four-axis scope, and degrades gracefully with empty states.

---

### 8.12 Notifications

See §10 for the channel architecture. Every module dispatches through the same `NotificationService` with templates, per-tenant channel config, consent enforcement, and a `NotificationLog`.

**Auto-notification triggers (from source brief):** foundation/roof/brick/painting completed, possession date, invoice, demand letter, payment receipt, delay notification, follow-up reminders, low-stock alerts, payment reminders.

---

### 8.13 AI Copilot & chatbot

See §9 for the full guardrail model. Customer-facing chatbot answers: project status, construction updates, payment, agreement, document download, invoices, complaints, possession, FAQs. Internal copilot summarizes and suggests. Voice support (WhatsApp/website/app) is **P1**.

---

### 8.14 Mobile apps (Flutter)

Four role experiences in one Flutter codebase:

- **Employee:** attendance, daily report, task, material request, approvals, project photos, GPS, **offline mode**.
- **Site Engineer:** progress update, checklist, inspection, photo upload, voice notes, drawing access, issue reporting, **offline mode**.
- **Sales:** leads, follow-up, meeting, call, WhatsApp, booking, customer.
- **Customer:** timeline, payment status, demand letter, agreement, invoices, photos, support chat, notifications.

**Acceptance criteria (P0):**
- [ ] Employee + Site Engineer apps capture data offline and sync on reconnect with conflict handling (last-write-wins with server timestamp + audit).
- [ ] GPS-stamped attendance and photo uploads work on flaky connections (queue + retry).
- [ ] Auth + tenant scoping identical to web.

---

## 9. AI layer — assist-only guardrails **[LOCKED]**

**Hard rule (non-negotiable):** AI never writes directly to inventory, accounts, ledgers, payment plans, demand letters, receipts, or pipeline stage. AI **proposes**; a deterministic rule or an authorized human **commits**.

- All AI calls go through `AiService`, which: enforces per-tenant token/cost budgets, strips/does-not-persist PII beyond what's needed, records an `AiInteraction`, and returns structured `AiSuggestion`/`AiPrediction` rows tagged to the target entity.
- Predictions (conversion %, delay risk, cash-flow forecast, etc.) are **displayed with a confidence and an "AI-generated" label** and are not treated as facts.
- The customer chatbot answers **only** from retrieved tenant data (RAG over the customer's own records) and canned FAQs; it cannot perform actions except returning documents the customer is already entitled to.
- Provider is OpenAI via the abstraction; swapping providers must not touch domain modules.

**Acceptance criteria (P0):**
- [ ] No code path lets an AI response mutate a financial/inventory/pipeline record.
- [ ] Every AI interaction is logged with prompt metadata (not raw PII), model, tokens, latency, cost.
- [ ] Chatbot answers are grounded in the requesting customer's own data and refuse out-of-scope asks.

---

## 10. Integrations — notifications & lead sources **[LOCKED, adapter pattern]**

- **Per-tenant channel config** stored encrypted in `control_plane.tenant_channels`: WhatsApp (Infobip **or** Meta Cloud API), Email (Brevo/SMTP), SMS (Twilio, 2Factor.in). Each tenant uses its own sender identities and credentials.
- **Adapter interface:** `send(channel, to, templateId, vars, tenantCtx)` → provider adapter. Adding a provider = new adapter, no domain change.
- **Consent:** `ConsentRecord` per customer per channel; dispatch respects consent and opt-out. WhatsApp uses approved templates only.
- **Inbound lead adapters:** website form, Meta Lead Ads, Google Ads, Instagram, LinkedIn, WhatsApp Business, property portals — each normalizes to `Lead` and records raw payload for debugging.

**Acceptance criteria (P0):**
- [ ] A tenant configures its own WhatsApp + Email + SMS credentials and sends a test message on each.
- [ ] Switching WhatsApp provider (Infobip ↔ Meta) is a config change, not a code change.
- [ ] Every dispatch writes a `NotificationLog` with provider message id + status callbacks.

---

## 11. API design conventions **[LOCKED]**

- REST, resource-oriented, versioned under `/api/v1`. JSON only.
- Tenant context from JWT (+ optional subdomain); never from a client-supplied `tenantId` in the body for business writes.
- Standard envelope: `{ data, meta }` on success; `{ error: { code, message, details } }` on failure. Consistent pagination (`page`, `pageSize`, `sort`, filter params) via ProComponents-compatible query contract.
- Validation via DTOs; reject unknown fields. Idempotency keys required on demand-letter/receipt/PO-create style endpoints.
- Domain events (`progress.updated`, `booking.created`, `payment.demanded`, etc.) published on an internal event bus that enqueues side-effects to BullMQ.
- ~~OpenAPI/Swagger generated and kept current; the SPA and Flutter apps consume a shared generated TypeScript/Dart client.~~
- REST API documented via Next.js Swagger integration; Flutter apps consume the same `/api/v1/*` endpoints.

---

## 12. Non-functional requirements

- **Tenant isolation correctness** (see §5.4) — highest priority; automated cross-tenant test suite in CI.
- **Auditability:** every state change writes `AuditLog` (actor, tenant, entity, before/after, timestamp).
- **Performance:** list endpoints paginated and indexed; dashboards backed by pre-aggregated queries/materialized views where needed; target p95 < 500ms for common reads at seed scale.
- **Offline mobile:** queue-and-sync for Employee/Site Engineer with retry + conflict resolution.
- **Reliability:** notification and demand-letter jobs are idempotent and retried with backoff; failures are visible in an ops view.
- **Security:** §6; encryption at rest for PII and channel creds; signed URLs; rate limiting; no secrets in logs.
- **Observability:** structured logs, request tracing, job dashboards (BullMQ board), error tracking.
- **Accessibility & i18n:** Ant Design components used accessibly; copy externalized for future localization (INR formatting, Indian date formats by default).

---

## 13. Repository structure **[LOCKED default]**

Monorepo (pnpm workspaces + Turborepo):

```
/apps
  /web            # Next.js App Router (frontend + API routes)
  /worker         # BullMQ workers (separate process)
  /mobile         # Flutter (Employee/Engineer/Sales/Customer shells)
/packages
  /db             # PostgreSQL schemas, migrations, tenant migration runner
  /shared         # DTOs, types, event contracts, validation
  /ai             # AiService abstraction + provider adapters
  /notifications  # channel adapters (WhatsApp/Email/SMS) + templates
  /rbac           # permission matrix, guards, scope resolvers
/docs
  data-model.md   # Mermaid ER diagram (kept current)
  DECISIONS.md    # every [OPEN] resolution + assumptions
  api.md          # API documentation
```

---

## 14. Coding conventions for the agent **[LOCKED]**

1. ~~**TypeScript strict** everywhere; no `any` without a written justification comment.~~ **JavaScript** (ES modules) everywhere; no TypeScript. Use ESLint for code quality.
2. ~~**Every module** = Nest module with controller + service + repository + DTOs + unit tests + e2e happy-path + seed data.~~ **Every module** = Next.js API route + service functions + SQL queries + unit tests + e2e happy-path + seed data.
3. **Repositories** always take tenant context; no ambient global DB client for business data.
4. ~~**Migrations** are generated via Drizzle, checked in, and applied by the tenant migration runner; never hand-edit applied migrations.~~ **Migrations** are SQL files, checked in, and applied by the tenant migration runner; never hand-edit applied migrations.
5. **Tests:** every P0 acceptance criterion in this doc maps to at least one automated test. The **cross-tenant isolation suite** and the **payment-vs-progress idempotency suite** are mandatory and block merge if failing.
6. **Domain events** for side-effects; no synchronous notification/PDF work inside request handlers.
7. **`AuditLog`** written by a shared interceptor on state-changing endpoints.
8. **No AI in the commit path** for money/inventory/ledger/pipeline (enforced by architecture + a lint/test check).
9. **Seed script** creates: 1 tenant, roles + permission matrix, 1 project with towers/floors/units, sample leads, materials, a vendor, a customer with a payment plan, and a few progress activities — enough to demo every dashboard.
10. **Humanizer pass** on any customer- or investor-facing generated copy/templates before it's considered done (remove AI-tells; keep it plain and specific).

---

## 15. Phased delivery roadmap (with Definition of Done)

Build in this order. Each phase ends with a PR that lists migrations, new endpoints, tests added, and updated `docs/`. **DoD = all P0 acceptance criteria for that phase's modules pass in CI, seed data demonstrates it, and the isolation suite is green.**

- **Phase 0 — Foundations.** Monorepo, CI, Neon connection, control-plane + tenant schema scaffolding, tenant provisioning + migration runner, tenant resolver middleware, cross-tenant isolation test suite, ER diagram, `DECISIONS.md`. *DoD: provision a tenant end-to-end; isolation suite green.*
- **Phase 1 — Identity, RBAC, Tenant Admin.** Auth (JWT + refresh), four-axis RBAC guards + scope resolvers, seeded permission matrix, Tenant Admin UI (users, roles, branding, channel config), audit interceptor.
- **Phase 2 — Property & Project structure + Planning-lite.** Project/tower/floor/unit tree + bulk generation, unit status history, milestones/tasks/Gantt, BOQ, drawings/RFI/issues.
- **Phase 3 — CRM.** Pipeline state machine, lead ingestion adapters (≥3 sources), follow-ups + reminders, bookings, agreements, KYC (encrypted), convert-to-customer + portal provisioning.
- **Phase 4 — Construction progress + Notifications core.** Activity templates, unit activities, checklists, photo upload, engineer approval, `progress.updated` event, `NotificationService` + all three channel adapters + consent + templates.
- **Phase 5 — Payment-vs-Progress engine + Customer portal.** Payment plans/milestones, deterministic demand-letter rule (idempotent), branded PDF, dispatch, receipts, schedule reconciliation, customer portal (realtime). *Mandatory: payment idempotency suite green.*
- **Phase 6 — Inventory + Procurement.** Material master, multi-warehouse stock, GRN/issue/transfer/return, low-stock alerts, vendor/RFQ/PO/invoice/payment, vendor scoring, project-linked consumption.
- **Phase 7 — Operational accounting.** AR/AP, ledger entries, project costing, budgets, GST fields, bank reconciliation, cash-flow view.
- **Phase 8 — Role dashboards.** All seven role dashboards over real data with pre-aggregation where needed.
- **Phase 9 — AI Copilot (assist-only).** `AiService`, predictions/suggestions across CRM/construction/finance, grounded customer chatbot; guardrail tests.
- **Phase 10 — HRMS.** Employee master, attendance (web + mobile), biometric import contract, leave, payroll, payslips, performance/training/documents.
- **Phase 11 — Mobile (Flutter).** Employee, Site Engineer (offline-first), Sales, Customer apps against the same API.
- **Phase 12 — Hardening.** Performance passes, observability, ops views for jobs, security review, full seed demo, docs finalization.

> **Sequencing rationale:** progress → notifications → payment engine (Phases 4–5) are ordered so the product's core differentiator is provable early, before the broader inventory/finance/HR breadth is filled in.

---

## 16. Open questions (resolve into DECISIONS.md)

- **Q1 (deployment, blocking Phase 0):** All-Vercel vs Vercel-frontend + container-backend (§4.2)? Default: split. *[human]*
- **Q2 (WhatsApp provider):** Infobip vs Meta Cloud API as the first adapter? Default: build the interface + Meta Cloud API first, Infobip second. *[human]*
- **Q3 (e-signature):** Which provider for agreement digital signature (P1)? *[human]*
- **Q4 (accounting depth):** Confirm N3 boundary — operational accounting in v1, statutory/GST-filing later? Default: yes. *[human/finance]*
- **Q5 (biometric devices):** Confirm the webhook/CSV contract is acceptable vs a specific device SDK. *[human]*
- **Q6 (mobile packaging):** One Flutter app with role-based shells vs separate builds? Default: one app, role-aware. *[human]*
- **Q7 (payment gateway, P2):** Which gateway when money movement is added, and does it change the `PaymentPlan`/`Receipt` schema now? Default: design schema to accommodate; don't build. *[human]*

---

## 17. Assumptions

- Currency INR; Indian tax (GST) and date/number formats are defaults; multi-currency is P2.
- Single Neon database with schema-per-tenant is acceptable for expected v1 tenant counts; database-per-tenant is a P2 escape hatch for large tenants.
- "OpenAI agents" = OpenAI Responses/Agents API behind `AiService`; no fine-tuning required for v1.
- ~~The source brief's stack directives (React + Ant Design, Node, Neon, Vercel, Flutter, OpenAI, Brevo/SMTP, Twilio/2Factor, WhatsApp Business API) are authoritative; framework-level choices (NestJS, Drizzle, BullMQ, monorepo) are the agent's defaults recorded here and overridable via `DECISIONS.md`.~~
- **Current stack:** Next.js 15 (App Router) + JavaScript + Ant Design 5 + PostgreSQL + pg + BullMQ + Flutter. Full-stack monolith with separate worker process.
