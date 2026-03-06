-- ============================================
-- Row Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE odometer_readings ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's organization_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'admin' FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- Organizations
-- ============================================
CREATE POLICY "Users can view their own organization"
  ON organizations FOR SELECT
  USING (id = get_user_org_id());

CREATE POLICY "Admins can update their organization"
  ON organizations FOR UPDATE
  USING (id = get_user_org_id() AND is_admin());

-- ============================================
-- Profiles
-- ============================================
CREATE POLICY "Users can view profiles in their organization"
  ON profiles FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Admins can update profiles in their organization"
  ON profiles FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "New users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================
-- Vehicles
-- ============================================
CREATE POLICY "Users can view vehicles in their organization"
  ON vehicles FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admins can insert vehicles"
  ON vehicles FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can update vehicles"
  ON vehicles FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can delete vehicles"
  ON vehicles FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

-- ============================================
-- Customers
-- ============================================
CREATE POLICY "Users can view customers in their organization"
  ON customers FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Admins can insert customers"
  ON customers FOR INSERT
  WITH CHECK (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can update customers"
  ON customers FOR UPDATE
  USING (organization_id = get_user_org_id() AND is_admin());

CREATE POLICY "Admins can delete customers"
  ON customers FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

-- ============================================
-- Trips
-- ============================================
CREATE POLICY "Users can view trips in their organization"
  ON trips FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE POLICY "Drivers can insert their own trips"
  ON trips FOR INSERT
  WITH CHECK (
    organization_id = get_user_org_id()
    AND driver_id = auth.uid()
  );

CREATE POLICY "Drivers can update their own trips"
  ON trips FOR UPDATE
  USING (
    organization_id = get_user_org_id()
    AND (driver_id = auth.uid() OR is_admin())
  );

CREATE POLICY "Admins can delete trips"
  ON trips FOR DELETE
  USING (organization_id = get_user_org_id() AND is_admin());

-- ============================================
-- GPS Points
-- ============================================
CREATE POLICY "Users can view GPS points for their org's trips"
  ON gps_points FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = gps_points.trip_id
      AND trips.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Drivers can insert GPS points for their trips"
  ON gps_points FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = gps_points.trip_id
      AND trips.driver_id = auth.uid()
    )
  );

-- ============================================
-- Odometer Readings
-- ============================================
CREATE POLICY "Users can view odometer readings in their org"
  ON odometer_readings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vehicles
      WHERE vehicles.id = odometer_readings.vehicle_id
      AND vehicles.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "Users can insert odometer readings for their org vehicles"
  ON odometer_readings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vehicles
      WHERE vehicles.id = odometer_readings.vehicle_id
      AND vehicles.organization_id = get_user_org_id()
    )
  );

-- ============================================
-- Function: Register new organization + admin
-- ============================================
CREATE OR REPLACE FUNCTION register_organization(
  org_name TEXT,
  user_full_name TEXT,
  user_email TEXT
)
RETURNS JSON AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create organization
  INSERT INTO organizations (name)
  VALUES (org_name)
  RETURNING id INTO new_org_id;

  -- Create profile for the calling user
  INSERT INTO profiles (id, organization_id, email, full_name, role)
  VALUES (auth.uid(), new_org_id, user_email, user_full_name, 'admin');

  RETURN json_build_object(
    'organization_id', new_org_id,
    'profile_id', auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
