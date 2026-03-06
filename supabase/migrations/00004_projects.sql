-- ============================================
-- Projects (underkategori till kunder)
-- ============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_customer ON projects(customer_id);

-- Lägg till project_id på trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);
CREATE INDEX idx_trips_project ON trips(project_id);

-- RLS för projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see org projects" ON projects
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "Admins insert projects" ON projects
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "Admins update projects" ON projects
  FOR UPDATE USING (organization_id = get_user_org_id());

CREATE POLICY "Admins delete projects" ON projects
  FOR UPDATE USING (organization_id = get_user_org_id() AND is_admin());

-- Uppdateringstrigger
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
