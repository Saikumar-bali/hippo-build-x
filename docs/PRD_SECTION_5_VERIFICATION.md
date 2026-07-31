# PRD §5 Multi-tenancy Verification

This document maps `Construction-ERP-PRD.md` §5 to the checked-in implementation.

## 5.1 Control plane and tenant schemas

| PRD item | Implementation | Status |
|---|---|---|
| `control_plane.tenants` | Tenant registry, immutable schema locator, status, isolation mode, storage prefix and migration state | Complete |
| `control_plane.platform_users` | Platform super-admin authentication records | Complete |
| `control_plane.plans` | Plan and entitlement records | Table complete; management is Phase 12 per DEC-009 |
| `control_plane.subscriptions` | Tenant-to-plan subscription records | Table complete; management is Phase 12 per DEC-009 |
| `control_plane.provisioning_jobs` | Durable, idempotent tenant setup and retry history | Complete |
| `control_plane.tenant_channels` | Separate Email, SMS and WhatsApp rows; credentials encrypted with versioned keys | Complete |
| `control_plane.feature_flags` | Platform-forced flag records | Table complete; management is Phase 12 per DEC-009 |
| `tenant_<tenantId>` | UUID-derived schema containing tenant users, roles, projects and business tables | Complete for implemented product phases |

The `/platform/tenants` control center exposes all operator-relevant records in plain language. Phase 12 records are visible but intentionally read-only until their owning phase.

## 5.2 Tenant resolution

- Tokens carry identity (`tenantId`, `userId`) and do not carry schema names, database URLs or cached permission arrays.
- Every authenticated request resolves the authoritative tenant locator from `control_plane.tenants`.
- Tenant SQL requires both `schemaName` and `tenantId`.
- Every tenant query runs in a transaction with a tenant-only `search_path` and `app.tenant_id`.
- The global tenant database helper is disabled and throws when used.
- Forced RLS prevents schema-qualified cross-tenant access even if application routing is bypassed.

The PRD mentions `roleIds` in the JWT. The implementation deliberately reloads authorization from tenant data instead of trusting cached role arrays. This is a security-strengthening implementation detail and does not weaken the locked isolation contract.

## 5.3 Provisioning

Creating a company records and runs these steps:

1. Create the immutable tenant schema.
2. Apply all versioned tenant migrations.
3. Seed the default permission matrix, roles and first administrator.
4. Persist the private object-storage prefix as `tenants/<tenantId>/`.
5. Initialize separate Email, SMS and WhatsApp channel records.
6. Mark the tenant active.

Provisioning is durable through `provisioning_jobs`, deterministic BullMQ IDs, idempotency keys, safe retry handling and terminal-state protection.

The active-tenant migration fleet runner is idempotent, checksum-validated and records versions both centrally and inside each tenant schema.

## 5.4 Acceptance evidence

| Acceptance criterion | Automated evidence |
|---|---|
| Tenant A cannot read or write Tenant B data | Hostile cross-tenant tests using a restricted `NOSUPERUSER NOBYPASSRLS` runtime role |
| New tenant is fully migrated and its admin can log in | Database provisioning test plus Playwright platform setup → tenant login lifecycle |
| Tenant migrations apply to all active schemas and reruns are no-ops | Fleet migration recovery and checksum/idempotency tests |
| Channel credentials are encrypted and never returned in plaintext | AES-256-GCM key-rotation, AAD-binding, legacy migration and response-masking tests |

## Phase ownership

DEC-009 remains authoritative:

- Phase 0: tenant provisioning.
- Phase 1: platform login, authenticated tenant visibility, tenant-owned branding/channels/settings.
- Phase 12: plan/subscription editing, platform-forced feature controls, suspend/resume and cross-tenant lifecycle operations.

Visibility in the platform control center does not prematurely enable Phase 12 write operations.
