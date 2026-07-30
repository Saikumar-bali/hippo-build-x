# Data Model

## Locked multi-tenancy boundary

Hippo Build X uses a shared PostgreSQL/Neon database with two kinds of schemas:

```text
control_plane
  Shared SaaS registry, platform identity, provisioning and encrypted channel metadata

tenant_<immutableTenantUuid>
  One isolated business schema per tenant
```

`public` is not an application data store. During the rolling migration from the early Phase 0 prototype, read-only compatibility views may exist temporarily for `tenants`, `tenant_migrations` and `platform_users`.

New schemas are generated from the immutable tenant UUID, without hyphens:

```text
tenant id: 550e8400-e29b-41d4-a716-446655440000
schema:    tenant_550e8400e29b41d4a716446655440000
```

Existing slug-named schemas remain valid and are resolved through the control plane. Slugs are login/URL labels; they never select a database schema.

## Control plane schema (`control_plane`)

### tenants

| Column | Type | Purpose |
|---|---|---|
| id | uuid | Immutable tenant identity |
| name | varchar(255) | Organization display name |
| slug | varchar(100) | Login and URL identifier |
| schema_name | varchar(100) | Current shared-schema locator |
| status | varchar(50) | `provisioning`, `active`, `failed`, `suspended` |
| isolation_mode | varchar(50) | `shared_schema` or future `dedicated_database` |
| database_secret_ref | text | P2 secret-manager locator; never a plaintext URL |
| database_region | varchar(100) | Data residency/region metadata |
| migration_version | varchar(255) | Latest applied tenant migration |
| data_location_status | varchar(50) | Provisioning/migration readiness |
| branding | jsonb | Legacy mirror; tenant-owned branding is in `tenant_settings` |
| feature_flags | jsonb | Legacy mirror; tenant-owned flags are in `tenant_settings` |
| created_at / updated_at | timestamptz | Lifecycle timestamps |
| deleted_at | timestamptz | Soft deletion marker |

### platform_users

Platform super administrators. These identities never live in a tenant schema and receive tokens with `scope=platform`.

| Column | Type | Purpose |
|---|---|---|
| id | uuid | Platform user identity |
| email | varchar(255) | Unique login |
| name | varchar(255) | Display name |
| password_hash | text | Argon2id password hash |
| role | varchar(50) | Currently `super_admin` |
| status | varchar(50) | `active` or `suspended` |
| created_at / updated_at | timestamptz | Lifecycle timestamps |
| deleted_at | timestamptz | Soft deletion marker |

### provisioning_jobs

Durable source of truth for tenant provisioning attempts. BullMQ is the delivery mechanism, not the job record.

| Column | Type | Purpose |
|---|---|---|
| id | uuid | Provisioning attempt identity |
| tenant_id | uuid | Tenant being provisioned |
| idempotency_key | varchar(255) | Prevents duplicate create/retry requests |
| status | varchar(50) | `queued`, `running`, `completed`, `failed` |
| current_step | varchar(80) | Last completed/current state-machine step |
| attempt_count | integer | Worker execution attempts |
| bullmq_job_id | varchar(255) | Deterministic queue locator |
| requested_by | uuid | Platform user who requested it |
| error_code / error_message | text | Operator-safe failure information |
| payload | jsonb | Non-secret provisioning input |
| started_at / finished_at | timestamptz | Attempt timing |

Provisioning state machine:

```text
registered
→ queued
→ starting
→ schema_created
→ migrations_applied
→ defaults_seeded
→ channel_record_created
→ active
```

A failure preserves the tenant schema for diagnosis and idempotent retry. Schema deletion is an explicit operator action, not an automatic worker response.

### tenant_channels

Encrypted per-tenant notification provider credentials.

| Column | Type | Purpose |
|---|---|---|
| tenant_id | uuid | Owning tenant |
| channel_type | varchar(50) | `email`, `sms`, `whatsapp`, or provisioning placeholder |
| provider | varchar(100) | Brevo, SMTP, Twilio, Meta, etc. |
| encrypted_credentials | text | AES-256-GCM ciphertext |
| encryption_key_version | varchar(50) | Key-rotation identifier |
| non_secret_config | jsonb | Sender IDs, from address and provider metadata |
| enabled | boolean | Tenant-owned enablement |
| verification_status | varchar(50) | `not_configured`, `pending_verification`, `verified`, `failed` |
| last_verified_at | timestamptz | Provider verification timestamp |

Credential encryption uses tenant ID plus channel type as authenticated associated data. Ciphertext copied to another tenant/channel cannot be decrypted. APIs return masked secrets only.

### Migration ledgers

- `control_plane.control_plane_migrations`: control-plane migration names and checksums.
- `control_plane.tenant_migrations`: fleet-level tenant migration summary.
- `tenant_<id>._tenant_migrations`: local migration source of truth, enabling future database-per-tenant movement.

Changing an already-recorded migration checksum is a deployment error. New changes require a new migration file.

### Phase 12 reserved tables

`plans`, `subscriptions` and platform-forced `feature_flags` are structurally reserved in the control plane. Their CRUD, entitlement enforcement, suspend/resume and subscription lifecycle remain Phase 12 per DEC-009.

## Tenant schema

Every business table belongs to one `tenant_<id>` schema. Core tables currently include:

| Area | Tables |
|---|---|
| Identity | `users`, `sessions`, `password_reset_tokens` |
| Authorization | `roles`, `user_roles` |
| Tenant configuration | `tenant_settings` |
| Audit | `audit_log` |
| Property | `projects`, `locations`, `blocks`, `towers`, `floors`, `unit_categories`, `units`, `unit_status_history` |
| Planning | `milestones`, `tasks`, `task_dependencies`, `boq_items` |
| Site coordination | `drawings`, `rfis`, `issues`, `approvals` |
| Later phases | leads, bookings, progress, materials, purchase orders, invoices and all other business records |

Tenant tables retain a `tenant_id` column as defense in depth even though the schema is already isolated.

## Request and query lifecycle

```text
JWT tenantId
  ↓
control_plane.tenants
  ↓
status + isolation_mode + authoritative schema/database locator
  ↓
transaction-local tenant SQL context
  ↓
SET LOCAL search_path = tenant_schema, pg_catalog
SET LOCAL app.tenant_id = tenant UUID
  ↓
schema isolation + forced tenant RLS
```

Tokens never contain trusted schema names, database connection URLs or permission arrays. Permissions, project scope and location scope are reloaded from the tenant schema on each authenticated request.

## Forced row-level security

Every tenant table containing `tenant_id` receives a forced policy equivalent to:

```sql
USING (
  tenant_id = '<schema-owner-tenant-id>'::uuid
  AND tenant_id = current_setting('app.tenant_id')::uuid
)
WITH CHECK (
  tenant_id = '<schema-owner-tenant-id>'::uuid
  AND tenant_id = current_setting('app.tenant_id')::uuid
)
```

This blocks both forms of hostile access:

1. Tenant B querying `tenant_A.users` with a schema-qualified SQL statement.
2. Tenant B inserting either Tenant B’s ID or a spoofed Tenant A ID into Tenant A’s schema.

Production and CI runtime roles must be `NOSUPERUSER NOBYPASSRLS`. Migration/operator credentials must be separate from normal application credentials.

## Database-per-tenant path (P2)

The application always resolves storage from `tenantId`. A future large tenant can switch from:

```text
isolation_mode = shared_schema
schema_name = tenant_<uuid>
```

To:

```text
isolation_mode = dedicated_database
database_secret_ref = secret-manager reference
```

No access-token format, user identity or API route changes are required. Promotion uses a controlled write pause, destination migration, data copy, checksum verification, locator switch, smoke test and rollback window.
