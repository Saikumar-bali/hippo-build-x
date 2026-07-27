-- Seed data for Construction ERP

-- Tenant
INSERT INTO tenants (id, name, slug, status, feature_flags) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Green Valley Developers', 'green-valley', 'active',
   '{"crm.enabled": true, "crm.pipeline.enabled": true, "construction.progress.enabled": true, "payment.engine.enabled": true, "inventory.enabled": true, "ai.copilot.enabled": false}');

-- Roles
INSERT INTO roles (id, tenant_id, name, description, permissions, is_system) VALUES
  ('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'admin', 'Full access', '["*"]', true),
  ('b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'project-manager', 'Project oversight',
   '["user.read","crm.lead.read","progress.read","progress.approve","payment.read","inventory.read","audit.read"]', false),
  ('b3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'sales-executive', 'Sales team',
   '["crm.lead.create","crm.lead.read","crm.lead.update","crm.pipeline.manage"]', false),
  ('b4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'site-engineer', 'Site operations',
   '["progress.submit","progress.read","inventory.read"]', false);

-- Users
INSERT INTO users (id, tenant_id, email, name, status) VALUES
  ('c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ravi@greenvalley.com', 'Ravi Sharma', 'active'),
  ('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'priya@greenvalley.com', 'Priya Nair', 'active'),
  ('c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'arjun@greenvalley.com', 'Arjun Reddy', 'active'),
  ('c4eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'meera@greenvalley.com', 'Meera Iyer', 'active'),
  ('c5eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'vikram@greenvalley.com', 'Vikram Patel', 'active');

-- User roles
INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'b3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c4eebc99-9c0b-4ef8-bb6d-6bb9bd380a44', 'b4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'c5eebc99-9c0b-4ef8-bb6d-6bb9bd380a55', 'b4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55');

-- Projects
INSERT INTO projects (id, tenant_id, name, code, description, status, start_date, end_date, budget, created_by) VALUES
  ('d1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
   'Green Valley Residency', 'GVR', 'Premium residential complex with 3 towers', 'in_progress',
   '2025-01-15', '2027-06-30', 250000000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('d2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
   'Valley Heights', 'VH', 'Mid-rise residential project', 'planning',
   '2025-09-01', '2027-12-31', 120000000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

-- Units for Green Valley Residency
INSERT INTO units (tenant_id, project_id, tower, floor, unit_number, category, area, status, price, created_by) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'A', 1, 'A-101', '2BHK', 1050.00, 'available', 5500000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'A', 1, 'A-102', '3BHK', 1450.00, 'booked', 7500000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'A', 2, 'A-201', '2BHK', 1050.00, 'available', 5600000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'A', 2, 'A-202', '3BHK', 1450.00, 'available', 7600000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'B', 1, 'B-101', '2BHK', 1050.00, 'sold', 5500000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'B', 1, 'B-102', '3BHK', 1450.00, 'available', 7500000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'B', 2, 'B-201', '2BHK', 1050.00, 'available', 5600000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'd1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'B', 2, 'B-202', '3BHK', 1450.00, 'booked', 7600000.00, 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

-- CRM Leads
INSERT INTO leads (tenant_id, name, email, phone, source, status, assigned_to, pipeline_stage, notes, created_by) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Ramesh Kumar', 'ramesh@email.com', '+91-9876543210', 'website', 'contacted', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'negotiation', 'Interested in 3BHK Tower A', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Sneha Gupta', 'sneha@email.com', '+91-9876543211', 'referral', 'new', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'new', 'Referred by Ramesh Kumar', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Amit Singh', 'amit@email.com', '+91-9876543212', 'advertisement', 'site_visit_done', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'site_visit', 'Visited Tower B, liked 2BHK', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Deepa Menon', 'deepa@email.com', '+91-9876543213', 'walk_in', 'booked', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', 'booked', 'Booked A-102, 3BHK Tower A', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Karthik Raj', 'karthik@email.com', '+91-9876543214', 'whatsapp', 'contacted', NULL, 'follow_up', 'Inquired about pricing via WhatsApp', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Lakshmi Devi', 'lakshmi@email.com', '+91-9876543215', 'website', 'new', NULL, 'new', 'Submitted enquiry form for 2BHK', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33');

-- Audit log sample entries
INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, actor_id, after) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'create', 'lead', '00000000-0000-0000-0000-000000000001', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', '{"name":"Ramesh Kumar","status":"new"}'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'update', 'lead', '00000000-0000-0000-0000-000000000001', 'c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33', '{"status":"contacted","pipeline_stage":"negotiation"}');
