# Platform Operations Verification

This document maps the hardening and platform-operations milestone in `Construction-ERP-PRD.md` and `HIPPO_BUILD_X_END_TO_END_BLUEPRINT.md` to checked-in implementation and proof.

## Operator experience

| Requirement | Implementation |
|---|---|
| Professional platform administration | `apps/web/src/modules/platform/PlatformControlCenter.js` and `.module.css` provide a dedicated navigation shell, health overview, organization workflows, commercial controls, operations and audit. |
| Protection details without dashboard clutter | **Security & isolation** drawer replaces the previous main-page explanatory block. |
| No internal roadmap wording in product UI | Source contract rejects `Phase 12` and `Automatic protection` in the control-center component. |
| Responsive admin theme | Fixed dark operations navigation, sticky header, responsive cards/tables/drawers and mobile navigation. |

## Company lifecycle

| Requirement | Endpoint / implementation |
|---|---|
| Add and provision company | `POST /api/v1/platform/tenants` plus `tenant.provision` worker. |
| Retry failed setup | `POST /api/v1/platform/tenants/:id/retry-provisioning`. |
| Suspend/resume | `PATCH /api/v1/platform/tenants/:id/status`. Suspension revokes sessions. Resume performs readiness checks. |
| Cross-company health | `GET /api/v1/platform/tenants/:id/health` and `GET /api/v1/platform/ops`. |
| Revoke all sessions | `POST /api/v1/platform/tenants/:id/revoke-sessions`. |

## Commercial controls

| Requirement | Endpoint / implementation |
|---|---|
| Plan list/create/update/archive | `GET|POST /api/v1/platform/plans`, `PATCH /api/v1/platform/plans/:id`. |
| Pricing and entitlements | Migration `006_phase12_platform_ops.sql` adds price, currency, trial, order and entitlement fields; default Starter/Growth/Enterprise records are seeded. |
| Subscription list/assign/update | `GET|POST /api/v1/platform/subscriptions`, `PATCH /api/v1/platform/subscriptions/:id`. |
| One current subscription per company | Partial unique index `subscriptions_one_current_per_tenant_idx` plus transactional assignment locking. |
| Runtime plan enforcement | `tenant-capability-service.js` resolves current plan modules for every authenticated tenant request. |

## Feature controls

| Requirement | Endpoint / implementation |
|---|---|
| Global and company overrides | `GET|POST|DELETE /api/v1/platform/feature-flags` and tenant-specific PATCH endpoint. |
| Runtime kill switch | `packages/rbac/src/guards/index.js` blocks mapped permissions when the effective module is disabled. |
| Safe precedence | Global forced-off wins; company forced-off follows; force-on cannot bypass plan entitlements. |
| Audit evidence | Every write calls `writePlatformAudit`. |

## Operations

| Requirement | Implementation |
|---|---|
| PostgreSQL/Redis status | `GET /api/v1/platform/ops`. |
| Queue depth and failures | BullMQ counts for `tenant.provision`, `notifications`, and `reports`. |
| Worker heartbeat | `apps/worker/src/platform-ops.js` writes `service_heartbeats` every 15 seconds. |
| Stale setup detection | Ops endpoint flags queued/running provisioning records older than ten minutes. |
| Platform audit viewer | `GET /api/v1/platform/audit` with pagination, action and search filters. |

## Export and deletion

| Requirement | Implementation |
|---|---|
| Verified company export | `POST /api/v1/platform/tenants/:id/export` creates a recorded JSON export under tenant-bound runtime access and excludes token/secret fields. |
| Soft delete | `POST /api/v1/platform/tenants/:id/delete` with `mode=soft_delete`; requires prior suspension, reason and typed slug confirmation. |
| Legal hold/release | Soft-delete job carries `legal_hold`; `mode=release_hold` requires typed confirmation and audit reason. |
| Delayed purge | `mode=purge` schedules retention in `tenant_deletion_jobs`. |
| Permanent worker execution | Worker claims due jobs using `SKIP LOCKED`, drops the tenant schema with operator credentials, removes sensitive control records and stores evidence. |
| Audit after purge | Tenant tombstone, subscriptions, export/deletion records and platform audit remain after schema removal. |

## Database records

Migration `packages/db/src/migrations/control/006_phase12_platform_ops.sql` introduces:

- commercial fields on `plans`
- assignment and cancellation fields on `subscriptions`
- `platform_audit_logs`
- `tenant_export_jobs`
- `tenant_deletion_jobs`
- `service_heartbeats`

Runtime grants are reapplied by `runControlPlaneMigrations()` after all migrations.

## Proof

- `apps/web/src/modules/platform/platform-ops-service.test.js`
- `apps/web/src/modules/platform/phase12-contract.test.js`
- `apps/web/src/modules/platform/control-center-contract.test.js`
- `apps/web/e2e/tenant-lifecycle.spec.js`
- database hostile-isolation and provisioning suites
- lint and production build
- CodeQL

Operational procedures and the launch checklist are in `docs/runbooks/platform-operations.md`.
