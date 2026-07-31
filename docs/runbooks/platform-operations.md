# Platform Operations Runbook

This runbook covers the platform-administrator controls implemented for the hardening and platform-operations milestone defined by `Construction-ERP-PRD.md` and `HIPPO_BUILD_X_END_TO_END_BLUEPRINT.md`.

## Operating principles

1. Company data remains isolated at all times. The web runtime uses a restricted database role and request-bound tenant context.
2. Platform writes require an authenticated `super_admin` and create a `control_plane.platform_audit_logs` record.
3. Suspension is immediate and reversible. Soft deletion is recoverable. Permanent purge is delayed and irreversible.
4. A global forced-off module control is an emergency kill switch and always wins.
5. Plan entitlements cannot be bypassed by a platform force-on control.
6. Export, offboarding and purge evidence remains in the control plane after tenant data is removed.

## Required production configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Restricted runtime role used by the web application and worker for ordinary reads/writes. |
| `MIGRATION_DATABASE_URL` | Operator role used only by checked-in migrations, tenant provisioning and scheduled purge. Required in production. |
| `DATABASE_RUNTIME_ROLE` | Role that receives runtime grants after migrations. Must be `NOSUPERUSER` and `NOBYPASSRLS`. |
| `REDIS_URL` | BullMQ transport for provisioning, notification and report queues. |
| `PLATFORM_API_KEY` | Optional machine-to-machine platform authentication. Browser operators use platform JWT cookies. |
| `TENANT_PURGE_RETENTION_DAYS` | Default delay between purge approval and permanent execution. Defaults to 30 days. |
| `PLATFORM_EXPORT_MAX_BYTES` | Maximum synchronous JSON export size. Defaults to 50 MB. |
| `WORKER_INSTANCE_ID` | Optional stable identifier shown in the operations heartbeat. |

## Daily platform check

Open **Platform Admin → Operations** and confirm:

- Web application, PostgreSQL, Redis and background worker show healthy.
- Worker heartbeat age is below 45 seconds.
- `tenant.provision`, `notifications` and `reports` queues have no unexplained failures.
- Provisioning stale count is zero.
- Failed setup records have an owner and remediation note.
- Scheduled purge dates match approved retention windows.

The API source for this view is `GET /api/v1/platform/ops`.

## Add a company

1. Open **Organizations** and choose **Add company**.
2. Enter the company name, login slug and first administrator details.
3. The platform creates a durable provisioning job and returns immediately.
4. The worker creates the private schema, applies all tenant migrations, seeds defaults, creates Email/SMS/WhatsApp channel records and marks the company active.
5. Confirm the company drawer shows:
   - lifecycle `Ready`
   - private schema readiness
   - latest migration version
   - three communication records
6. Assign a commercial plan under **Plans & subscriptions**.

No manual SQL is permitted during normal provisioning.

## Setup failure

1. Open the company drawer and inspect **Overview → Setup progress**.
2. Record the error code, error message and attempt count.
3. Correct the infrastructure or migration cause.
4. Choose **Retry setup**. A new durable attempt is queued with an idempotency key.
5. Confirm the worker heartbeat and `tenant.provision` queue are healthy.
6. Do not mark the company active manually. The worker owns that transition.

## Suspend and resume

### Suspend

Use for contract enforcement, security incidents or support containment.

1. Choose **Actions → Suspend company**.
2. Enter a clear reason.
3. The platform changes the lifecycle to `suspended` and revokes every active tenant session.
4. Tenant login and all protected tenant APIs return a suspension response.
5. Verify the audit action `tenant.suspended`.

### Resume

1. Confirm the tenant schema exists, migrations are present and data location is not purged.
2. Choose **Actions → Resume company**.
3. The API runs readiness checks before returning the lifecycle to `active`.
4. Users must sign in again because previous sessions remain revoked.
5. Verify the audit action `tenant.resumed`.

## Revoke all company sessions

Use when credentials may be compromised or after a high-risk administrator change.

1. Open the company drawer.
2. Choose **Security → Revoke all** or **Actions → Revoke all sessions**.
3. Enter the incident/support reason.
4. Confirm the returned revoked-session count.
5. Verify `tenant.sessions_revoked` in **Audit & access**.

This action does not suspend the company.

## Plans and subscriptions

### Create or edit a plan

A plan defines:

- monthly and annual price
- currency and trial duration
- user, project and storage limits
- included modules
- active or archived lifecycle

An active plan cannot be archived while current subscriptions still reference it.

### Assign a plan

1. Open **Plans & subscriptions → Assign plan**.
2. Select the company, plan, lifecycle and dates.
3. The assignment transaction locks the company and current subscription.
4. Any previous current subscription is closed before the new record is created.
5. A partial unique index guarantees one `active`, `trial` or `paused` subscription per company.

## Feature controls

Feature keys use `module.<module-name>`, for example `module.crm`.

Resolution order:

1. Assigned plan entitlement
2. Company-owned feature preference
3. Platform global or company-specific control

Safety rules:

- Global forced-off always disables the module for every company.
- Company-specific forced-off disables it for one company.
- Force-on may override a company preference but cannot grant a module excluded from the commercial plan.
- Every protected API permission is mapped to a module before RBAC permission evaluation.

Always provide an operational reason and remove the control when the incident or exception ends.

## Verified company export

1. Open the company drawer and choose **Export company data**.
2. The platform records a running export job.
3. The runtime reads only the selected company schema under bound tenant context.
4. Session/token tables and secret-like columns are excluded.
5. The browser receives a private, non-cacheable JSON download.
6. Table count, row count, bytes, manifest and completion status are recorded.
7. Verify `tenant.exported` or `tenant.export_failed` in the audit log.

Exports above `PLATFORM_EXPORT_MAX_BYTES` are rejected for the synchronous path. Use an approved background/object-storage export procedure for larger tenants.

## Offboarding and deletion

### 1. Suspend

Suspend the company first. This blocks new access and revokes sessions.

### 2. Export

Produce and securely retain a verified export when contract or policy requires it.

### 3. Soft delete

1. Choose **Offboard company**.
2. Enter a reason of at least 10 characters.
3. Type `DELETE <company-slug>` exactly.
4. Enable legal hold when deletion must be blocked for regulatory, litigation or investigation reasons.
5. The platform:
   - closes current subscriptions
   - revokes sessions again defensively
   - marks the company soft-deleted
   - preserves the tenant schema for recovery
   - records deletion and audit evidence

### 4. Legal hold

A legal hold blocks purge scheduling. Releasing it requires the same typed confirmation and a reason. Confirm legal approval outside the application before release.

### 5. Schedule purge

1. Confirm the company is soft-deleted and has no active legal hold.
2. Choose **Schedule purge** from **Operations → Offboarding & purge**.
3. Enter the retention period and typed confirmation.
4. The job remains `scheduled` until `scheduled_for`.

### 6. Worker purge

The worker claims one eligible purge with `FOR UPDATE ... SKIP LOCKED`, then:

- drops the tenant schema using `MIGRATION_DATABASE_URL`
- removes tenant migration records, encrypted communication records and tenant-specific feature controls
- closes any remaining current subscription
- marks the data location `purged`
- stores counts and timestamps as deletion evidence
- writes `tenant.purged`

The control-plane tenant tombstone, subscriptions, export metadata, deletion evidence and audit history remain.

## Incident response: platform feature shutdown

1. Verify the incident affects a specific module.
2. Apply a **global forced-off** control only when all companies must be protected.
3. Use a company-specific forced-off for isolated incidents.
4. Confirm a protected endpoint now returns a disabled-module authorization response.
5. Record external incident/ticket reference in the reason.
6. Remove the forced control after recovery and confirm the plan/tenant preference resumes.

## Rollback and recovery

### Application release rollback

- Roll back the web and worker release together when route/worker contracts changed.
- Do not edit an applied SQL migration. Add a forward corrective migration.
- Keep the new control-plane tables during application rollback; older code ignores them.

### Soft-deleted company recovery

Recovery is intentionally an operator-assisted process before purge:

1. Confirm legal/commercial approval.
2. Verify the tenant schema still exists and migrations are intact.
3. Cancel any scheduled purge job through an approved database migration or recovery command.
4. Clear `deleted_at`, restore `data_location_status = 'ready'` and set lifecycle to `suspended` through a checked-in recovery procedure.
5. Reassign the approved plan.
6. Resume from the platform API and validate tenant login.
7. Record the recovery in platform audit evidence.

Never recover a company whose data location is `purged` without restoring from a separately approved backup.

## Production launch checklist

- [ ] Control-plane migration `006_phase12_platform_ops.sql` applied.
- [ ] Runtime role remains `NOSUPERUSER` and `NOBYPASSRLS`.
- [ ] Operator URL is separate from runtime URL in production.
- [ ] Redis is reachable from both web and worker.
- [ ] Worker heartbeat is healthy.
- [ ] Queue failure alerts are configured.
- [ ] PostgreSQL backups and restore drills are current.
- [ ] Secret rotation procedure is documented and tested.
- [ ] Export retention and secure handling policy is approved.
- [ ] Purge retention and legal-hold policy is approved.
- [ ] Audit retention meets contractual/regulatory requirements.
- [ ] Browser lifecycle, hostile isolation tests, production build and CodeQL are green.
- [ ] Exact PR head has no unresolved automated review findings.
