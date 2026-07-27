# Data Model

## Control Plane Schema (`public`)

Manages tenant registry and global configuration.

### tenants

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| name | varchar(255) | Tenant display name |
| slug | varchar(100) | URL-safe identifier |
| schema_name | varchar(100) | PostgreSQL schema name |
| status | varchar(50) | active, suspended, deactivated |
| branding | jsonb | Logo, colors, custom branding |
| feature_flags | jsonb | Enabled features |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |
| deleted_at | timestamptz | Soft delete timestamp |

### tenant_migrations

Tracks which migrations have been applied to each tenant schema.

## Tenant Schema (per-tenant)

Each tenant schema contains the following base tables:

### users

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant reference |
| email | varchar(255) | User email |
| name | varchar(255) | Display name |
| password_hash | text | Bcrypt hash |
| status | varchar(50) | active, inactive, suspended |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |
| deleted_at | timestamptz | Soft delete timestamp |

### roles

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant reference |
| name | varchar(100) | Role name |
| description | text | Role description |
| permissions | jsonb | Array of permission strings |
| is_system | boolean | System role (cannot delete) |

### user_roles

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant reference |
| user_id | uuid | FK to users |
| role_id | uuid | FK to roles |
| project_id | uuid | Optional project scope |
| location_id | uuid | Optional location scope |

### audit_log

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant reference |
| action | varchar(100) | create, update, delete, login, logout |
| entity_type | varchar(100) | user, role, lead, payment, etc. |
| entity_id | uuid | ID of the affected entity |
| actor_id | uuid | Who performed the action |
| before | jsonb | State before change |
| after | jsonb | State after change |
| correlation_id | uuid | Request correlation |
| ip_address | varchar(45) | Source IP |

See individual module RFCs for additional tables.
