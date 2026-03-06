-- ============================================
-- Extended Features Migration
-- Geofencing, Congestion Tax, CO2, Fuel,
-- Driver Scoring, Checklists, Alerts, Reports,
-- Integrations, Private Trip Rules
-- ============================================

-- ============================================
-- 1. Geofences (for auto-classification)
-- ============================================
CREATE TYPE geofence_type AS ENUM ('home', 'office', 'customer', 'other');

CREATE TABLE geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES profiles(id), -- NULL = org-wide
  name TEXT NOT NULL,
  type geofence_type NOT NULL DEFAULT 'other',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 200,
  auto_trip_type TEXT, -- 'business' or 'private' - auto-classify trips starting/ending here
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_geofences_org ON geofences(organization_id);
CREATE INDEX idx_geofences_driver ON geofences(driver_id);

-- ============================================
-- 2. Congestion Tax Passages
-- ============================================
CREATE TABLE congestion_tax_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  station_name TEXT NOT NULL, -- e.g. "Liljeholmen", "Essingeleden"
  city TEXT NOT NULL DEFAULT 'Stockholm', -- Stockholm or Göteborg
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  passage_time TIMESTAMPTZ NOT NULL,
  amount_sek NUMERIC(6,2) NOT NULL, -- Tax amount
  is_high_traffic BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_congestion_trip ON congestion_tax_passages(trip_id);
CREATE INDEX idx_congestion_vehicle ON congestion_tax_passages(vehicle_id);

-- ============================================
-- 3. CO2 emission factors per fuel type
-- ============================================
ALTER TABLE vehicles ADD COLUMN co2_per_km NUMERIC(6,2); -- g CO2/km
ALTER TABLE vehicles ADD COLUMN fuel_consumption_per_10km NUMERIC(6,2); -- liters per 10km

-- Add CO2 calculation to trips
ALTER TABLE trips ADD COLUMN co2_emissions_kg NUMERIC(8,3);
ALTER TABLE trips ADD COLUMN congestion_tax_total NUMERIC(8,2) DEFAULT 0;

-- ============================================
-- 4. Fuel Logs
-- ============================================
CREATE TYPE fuel_log_type AS ENUM ('refuel', 'charge'); -- charge for EVs

CREATE TABLE fuel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES profiles(id),
  log_type fuel_log_type NOT NULL DEFAULT 'refuel',
  liters NUMERIC(8,2), -- NULL for electric
  kwh NUMERIC(8,2), -- For electric vehicles
  cost_sek NUMERIC(10,2),
  odometer_km INTEGER,
  station_name TEXT,
  is_full_tank BOOLEAN DEFAULT true,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fuel_logs_vehicle ON fuel_logs(vehicle_id);
CREATE INDEX idx_fuel_logs_org ON fuel_logs(organization_id);

-- ============================================
-- 5. Driver Behavior Scoring
-- ============================================
CREATE TABLE driver_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES profiles(id),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  acceleration_score INTEGER CHECK (acceleration_score BETWEEN 0 AND 100),
  braking_score INTEGER CHECK (braking_score BETWEEN 0 AND 100),
  speeding_score INTEGER CHECK (speeding_score BETWEEN 0 AND 100),
  idle_score INTEGER CHECK (idle_score BETWEEN 0 AND 100),
  harsh_events INTEGER DEFAULT 0,
  max_speed_kmh NUMERIC(6,1),
  avg_speed_kmh NUMERIC(6,1),
  idle_duration_seconds INTEGER DEFAULT 0,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_driver_scores_driver ON driver_scores(driver_id);
CREATE INDEX idx_driver_scores_trip ON driver_scores(trip_id);
CREATE INDEX idx_driver_scores_org ON driver_scores(organization_id);

-- ============================================
-- 6. Vehicle Checklists (daily inspections)
-- ============================================
CREATE TABLE checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]', -- [{label: string, required: boolean}]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE checklist_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES checklist_templates(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  driver_id UUID NOT NULL REFERENCES profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  responses JSONB NOT NULL DEFAULT '{}', -- {item_index: {checked: bool, note?: string}}
  all_passed BOOLEAN NOT NULL DEFAULT true,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_resp_vehicle ON checklist_responses(vehicle_id);
CREATE INDEX idx_checklist_resp_driver ON checklist_responses(driver_id);

-- ============================================
-- 7. Alert Rules + Alert Log
-- ============================================
CREATE TYPE alert_type AS ENUM (
  'odometer_deviation',   -- >10% mätaravvikelse
  'driverless_trip',      -- Resa utan identifierad förare
  'no_trips_7d',          -- Inga resor på 7 dagar
  'no_trips_14d',         -- Inga resor på 14 dagar
  'gps_lost',             -- Tappad GPS-kontakt
  'speed_violation',      -- Hastighetsöverträdelse
  'missing_purpose',      -- Resa utan ändamål ifyllt
  'private_limit_exceeded', -- Privatkörning över gräns
  'checklist_failed'      -- Fordonskontroll ej godkänd
);

CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type alert_type NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  threshold_value NUMERIC, -- e.g., 10 for 10% deviation
  notify_admin BOOLEAN DEFAULT true,
  notify_driver BOOLEAN DEFAULT false,
  notify_email TEXT[], -- Additional email recipients
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_rules_org ON alert_rules(organization_id);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type alert_type NOT NULL,
  driver_id UUID REFERENCES profiles(id),
  vehicle_id UUID REFERENCES vehicles(id),
  trip_id UUID REFERENCES trips(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_org ON alerts(organization_id);
CREATE INDEX idx_alerts_unread ON alerts(organization_id, is_read) WHERE is_read = false;

-- ============================================
-- 8. Scheduled Monthly Reports
-- ============================================
CREATE TABLE report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly', -- monthly, weekly
  day_of_month INTEGER DEFAULT 1, -- 1-28
  recipients TEXT[] NOT NULL DEFAULT '{}', -- Email addresses
  include_sections TEXT[] DEFAULT ARRAY['trips', 'distance', 'benefit', 'fuel', 'co2'],
  vehicle_ids UUID[] DEFAULT '{}', -- Empty = all vehicles
  driver_ids UUID[] DEFAULT '{}', -- Empty = all drivers
  is_active BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_schedules_org ON report_schedules(organization_id);

CREATE TABLE generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES report_schedules(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  report_type TEXT NOT NULL, -- 'monthly', 'benefit', 'fuel', 'co2'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}', -- Report data
  file_url TEXT, -- Storage URL if generated as file
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_generated_reports_org ON generated_reports(organization_id);

-- ============================================
-- 9. Private Trip Rules
-- ============================================
CREATE TABLE private_trip_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id), -- NULL = all vehicles
  driver_id UUID REFERENCES profiles(id), -- NULL = all drivers
  name TEXT NOT NULL,
  -- Time windows when private trips are allowed
  allowed_weekdays INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6,7], -- 1=Mon, 7=Sun
  allowed_start_time TIME DEFAULT '17:00',
  allowed_end_time TIME DEFAULT '07:00',
  -- Limits
  max_private_km_per_month NUMERIC(10,2),
  max_private_trips_per_month INTEGER,
  max_private_percentage NUMERIC(5,2), -- Max % of total driving
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_private_rules_org ON private_trip_rules(organization_id);

-- ============================================
-- 10. Accounting Integrations
-- ============================================
CREATE TYPE integration_provider AS ENUM ('fortnox', 'visma', 'hogia', 'custom_api');
CREATE TYPE integration_status AS ENUM ('active', 'inactive', 'error');

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  status integration_status NOT NULL DEFAULT 'inactive',
  config JSONB NOT NULL DEFAULT '{}', -- Encrypted API keys, settings
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_org ON integrations(organization_id);

-- ============================================
-- 11. Benefit Car Tracking
-- ============================================
ALTER TABLE vehicles ADD COLUMN benefit_car_driver_id UUID REFERENCES profiles(id);

CREATE TABLE benefit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  driver_id UUID NOT NULL REFERENCES profiles(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  total_distance_km NUMERIC(10,2) DEFAULT 0,
  business_distance_km NUMERIC(10,2) DEFAULT 0,
  private_distance_km NUMERIC(10,2) DEFAULT 0,
  business_trips INTEGER DEFAULT 0,
  private_trips INTEGER DEFAULT 0,
  private_percentage NUMERIC(5,2) DEFAULT 0,
  benefit_value_sek NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id, driver_id, period_year, period_month)
);

CREATE INDEX idx_benefit_reports_org ON benefit_reports(organization_id);
CREATE INDEX idx_benefit_reports_driver ON benefit_reports(driver_id);

-- ============================================
-- RLS for new tables
-- ============================================
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE congestion_tax_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_trip_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_logs ENABLE ROW LEVEL SECURITY;

-- Org-scoped read for all new tables
CREATE POLICY "org_read_geofences" ON geofences FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_congestion" ON congestion_tax_passages FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND trips.organization_id = get_user_org_id()));
CREATE POLICY "org_read_fuel" ON fuel_logs FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_scores" ON driver_scores FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_chk_templates" ON checklist_templates FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_chk_responses" ON checklist_responses FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_alert_rules" ON alert_rules FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_alerts" ON alerts FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_report_sched" ON report_schedules FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_gen_reports" ON generated_reports FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_private_rules" ON private_trip_rules FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_integrations" ON integrations FOR SELECT USING (organization_id = get_user_org_id());
CREATE POLICY "org_read_benefit" ON benefit_reports FOR SELECT USING (organization_id = get_user_org_id());

-- Insert policies for drivers
CREATE POLICY "driver_insert_fuel" ON fuel_logs FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "driver_insert_chk" ON checklist_responses FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND driver_id = auth.uid());
CREATE POLICY "driver_insert_scores" ON driver_scores FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "insert_congestion" ON congestion_tax_passages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_id AND trips.driver_id = auth.uid()));

-- Admin-only write policies
CREATE POLICY "admin_manage_geofences" ON geofences FOR ALL USING (organization_id = get_user_org_id() AND is_admin());
CREATE POLICY "admin_manage_alert_rules" ON alert_rules FOR ALL USING (organization_id = get_user_org_id() AND is_admin());
CREATE POLICY "admin_manage_report_sched" ON report_schedules FOR ALL USING (organization_id = get_user_org_id() AND is_admin());
CREATE POLICY "admin_manage_private_rules" ON private_trip_rules FOR ALL USING (organization_id = get_user_org_id() AND is_admin());
CREATE POLICY "admin_manage_integrations" ON integrations FOR ALL USING (organization_id = get_user_org_id() AND is_admin());
CREATE POLICY "admin_manage_chk_templates" ON checklist_templates FOR ALL USING (organization_id = get_user_org_id() AND is_admin());
CREATE POLICY "admin_manage_alerts" ON alerts FOR UPDATE USING (organization_id = get_user_org_id() AND is_admin());
CREATE POLICY "admin_insert_gen_reports" ON generated_reports FOR INSERT WITH CHECK (organization_id = get_user_org_id());
CREATE POLICY "admin_insert_benefit" ON benefit_reports FOR INSERT WITH CHECK (organization_id = get_user_org_id() AND is_admin());

-- Triggers
CREATE TRIGGER trg_geofences_updated BEFORE UPDATE ON geofences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_alert_rules_updated BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_report_schedules_updated BEFORE UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_private_rules_updated BEFORE UPDATE ON private_trip_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_integrations_updated BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
