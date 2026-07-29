-- Phase 2 planning: milestones, tasks, BOQ, drawings, RFIs, issues

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100),
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'planned',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  milestone_id UUID REFERENCES milestones(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'todo',
  progress_pct INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  predecessor_id UUID NOT NULL REFERENCES tasks(id),
  successor_id UUID NOT NULL REFERENCES tasks(id),
  dependency_type VARCHAR(20) NOT NULL DEFAULT 'FS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (predecessor_id, successor_id),
  CHECK (predecessor_id <> successor_id)
);

CREATE TABLE IF NOT EXISTS boq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  code VARCHAR(100),
  description TEXT NOT NULL,
  unit VARCHAR(50),
  quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
  rate NUMERIC(18, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR(255) NOT NULL,
  drawing_number VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  file_url TEXT,
  notes TEXT,
  supersedes_id UUID REFERENCES drawings(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drawings_number_version
  ON drawings(project_id, drawing_number, version) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS rfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  raised_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(50) NOT NULL DEFAULT 'medium',
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_boq_project ON boq_items(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drawings_project ON drawings(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id) WHERE deleted_at IS NULL;
