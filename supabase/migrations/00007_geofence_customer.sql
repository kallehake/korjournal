-- Koppla geofences till kund och projekt för automatisk klassificering av resor
ALTER TABLE geofences
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN geofences.customer_id IS 'Om satt kopplas resor som slutar i zonen automatiskt till denna kund';
COMMENT ON COLUMN geofences.project_id IS 'Om satt kopplas resor som slutar i zonen automatiskt till detta projekt';
