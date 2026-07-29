# Module Ownership

Every module must have named owners.

## Format

```
Module: <name>
Module Owner: <name>
Backend Owner: <name>
Frontend Owner: <name>
QA Owner: <name>
Database Reviewer: <name>
Security Reviewer: <name>
Product Approver: <name>
```

## Modules

### Phase 0 — Foundations

```
Module: Foundations
Module Owner: Saikumar-bali
Backend Owner: Saikumar-bali
Frontend Owner: Saikumar-bali
QA Owner: Saikumar-bali
Database Reviewer: Saikumar-bali
Security Reviewer: Saikumar-bali
Product Approver: Saikumar-bali
```

Owns: monorepo, CI/CD, tenant provisioning, migration runner, tenant context, health/readiness, isolation tests. Super Admin **provision** only (Phase 0).

### Phase 1 — Identity, RBAC, Tenant Administration

```
Module: Identity & RBAC
Module Owner: Saikumar-bali
Backend Owner: Saikumar-bali
Frontend Owner: Saikumar-bali
QA Owner: Saikumar-bali
Database Reviewer: Saikumar-bali
Security Reviewer: Saikumar-bali
Product Approver: Saikumar-bali
```

- Authentication (Argon2id, cookie sessions)
- Platform super-admin login (`platform_users`)
- User/Role CRUD + permission matrix
- Branding / channel config / audit UI
- Four-axis RBAC guards
- Tenant-owned feature flags

> Platform suspend/resume, plans/subscriptions, forced kill-switches, export → **Phase 12** (DEC-009).

### Phase 2 — Property and Project Planning

```
Module: Property & Planning
Module Owner: Saikumar-bali
Backend Owner: Saikumar-bali
Frontend Owner: Saikumar-bali
QA Owner: Saikumar-bali
Database Reviewer: Saikumar-bali
Security Reviewer: Saikumar-bali
Product Approver: Saikumar-bali
```

- Project → Block → Tower → Floor → Unit
- Bulk unit generation + status history
- Milestones, tasks, FS dependencies
- BOQ, drawings (versioned), RFIs, issues
- `/projects` Ant Design UI

### Phase 3 — CRM

- Lead management
- Pipeline state machine
- Booking, Agreement, KYC

### Phase 4 — Construction Progress

- Activity tracking
- Photos, Inspections
- Notifications

### Phase 5 — Payment Engine

- Payment plans
- Demand letters
- Customer portal

### Phase 6 — Inventory & Procurement

- Material, Warehouse, Stock
- RFQ, Purchase Orders, GRN

### Phase 7 — Operational Accounting

- Chart of Accounts
- AR/AP, Ledger, Reconciliation

### Phase 8 — Dashboards

- Role-based dashboards

### Phase 9 — AI Copilot

- AI provider abstraction
- Guardrails

### Phase 10 — HRMS

- Employee, Attendance, Payroll

### Phase 11 — Flutter Mobile

- Role-based mobile experiences
- Offline sync

### Phase 12 — Hardening & Platform Ops

```
Module: Platform Ops
Module Owner: Saikumar-bali
Backend Owner: Saikumar-bali
Frontend Owner: Saikumar-bali
QA Owner: Saikumar-bali
Database Reviewer: Saikumar-bali
Security Reviewer: Saikumar-bali
Product Approver: Saikumar-bali
```

- Suspend / resume tenants
- Platform-forced module kill-switches
- Plans & subscriptions
- Cross-tenant health / ops views
- Force session revoke, export / deletion
- Production hardening (backups, monitoring, security)
