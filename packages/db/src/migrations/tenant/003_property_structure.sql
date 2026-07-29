-- Phase 2 property structure: expand projects + hierarchy + units

ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget NUMERIC(18, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS state VARCHAR(100);

CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS towers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  block_id UUID REFERENCES blocks(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  floors_planned INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  tower_id UUID NOT NULL REFERENCES towers(id),
  floor_number INT NOT NULL,
  name VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  UNIQUE (tower_id, floor_number)
);

CREATE TABLE IF NOT EXISTS unit_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL,
  bedrooms INT,
  bathrooms INT,
  carpet_area NUMERIC(12, 2),
  base_price NUMERIC(18, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  tower_id UUID NOT NULL REFERENCES towers(id),
  floor_id UUID NOT NULL REFERENCES floors(id),
  category_id UUID REFERENCES unit_categories(id),
  unit_number VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  carpet_area NUMERIC(12, 2),
  price NUMERIC(18, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  UNIQUE (project_id, tower_id, floor_id, unit_number)
);

CREATE TABLE IF NOT EXISTS unit_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  unit_id UUID NOT NULL REFERENCES units(id),
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  reason TEXT,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  correlation_id VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_blocks_project ON blocks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_towers_project ON towers(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_floors_tower ON floors(tower_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_project ON units(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_unit_history_unit ON unit_status_history(unit_id);
