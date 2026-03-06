-- ============================================
-- Körjournal Database Schema
-- Skatteverket-compliant digital trip journal
-- ============================================

-- Enable required extensions
-- gen_random_uuid() is built-in to PostgreSQL 13+
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================
-- 1. Organizations (multi-tenant)
-- ============================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  org_number TEXT, -- Organisationsnummer
  address TEXT,
  city TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'SE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. Profiles (users linked to auth.users)
-- ============================================
CREATE TYPE user_role AS ENUM ('admin', 'driver');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'driver',
  phone TEXT,
  driver_id TEXT, -- Internal driver identifier
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_org ON profiles(organization_id);

-- ============================================
-- 3. Vehicles
-- ============================================
CREATE TYPE fuel_type AS ENUM ('petrol', 'diesel', 'electric', 'hybrid', 'plugin_hybrid', 'other');

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL,
  make TEXT, -- Märke
  model TEXT, -- Modell
  year INTEGER,
  fuel_type fuel_type DEFAULT 'petrol',
  current_odometer INTEGER, -- Current mätarställning in km
  is_company_car BOOLEAN DEFAULT true,
  benefit_value NUMERIC(10,2), -- Förmånsvärde
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, registration_number)
);

CREATE INDEX idx_vehicles_org ON vehicles(organization_id);

-- ============================================
-- 4. Customers (for billing)
-- ============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  org_number TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  zip_code TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_org ON customers(organization_id);

-- ============================================
-- 5. Trips (core - Skatteverket fields)
-- ============================================
CREATE TYPE trip_type AS ENUM ('business', 'private');
CREATE TYPE trip_status AS ENUM ('active', 'completed', 'draft');

CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES profiles(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  customer_id UUID REFERENCES customers(id),

  -- Skatteverket required fields
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  odometer_start INTEGER NOT NULL, -- Mätarställning vid start (km)
  odometer_end INTEGER, -- Mätarställning vid slut (km)
  start_address TEXT NOT NULL,
  end_address TEXT,
  purpose TEXT, -- Ändamål / syfte med resan
  visited_person TEXT, -- Besökt person/företag
  trip_type trip_type NOT NULL DEFAULT 'business',
  status trip_status NOT NULL DEFAULT 'active',

  -- Calculated fields
  distance_km NUMERIC(10,2), -- Körd sträcka
  distance_gps_km NUMERIC(10,2), -- GPS-beräknad sträcka
  distance_deviation_pct NUMERIC(5,2), -- Avvikelse mellan GPS och mätare

  -- GPS route summary
  route_polyline TEXT, -- Encoded polyline for map display
  start_lat DOUBLE PRECISION,
  start_lng DOUBLE PRECISION,
  end_lat DOUBLE PRECISION,
  end_lng DOUBLE PRECISION,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_org ON trips(organization_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX idx_trips_date ON trips(date DESC);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_type ON trips(trip_type);

-- ============================================
-- 6. GPS Points (raw tracking data)
-- ============================================
CREATE TABLE gps_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION, -- meters
  speed DOUBLE PRECISION, -- m/s
  heading DOUBLE PRECISION, -- degrees
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gps_points_trip ON gps_points(trip_id);
CREATE INDEX idx_gps_points_timestamp ON gps_points(trip_id, timestamp);

-- ============================================
-- 7. Odometer Readings
-- ============================================
CREATE TYPE odometer_source AS ENUM ('manual', 'obd2', 'trip_start', 'trip_end');

CREATE TABLE odometer_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id),
  reading_km INTEGER NOT NULL,
  source odometer_source NOT NULL DEFAULT 'manual',
  recorded_by UUID REFERENCES profiles(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_odometer_vehicle ON odometer_readings(vehicle_id);
CREATE INDEX idx_odometer_recorded ON odometer_readings(vehicle_id, recorded_at DESC);

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_trips_updated BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Auto-calculate distance on trip completion
-- ============================================
CREATE OR REPLACE FUNCTION calculate_trip_distance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.odometer_end IS NOT NULL AND NEW.odometer_start IS NOT NULL THEN
    NEW.distance_km = NEW.odometer_end - NEW.odometer_start;
    IF NEW.distance_gps_km IS NOT NULL AND NEW.distance_gps_km > 0 THEN
      NEW.distance_deviation_pct = ABS(
        (NEW.distance_km - NEW.distance_gps_km) / NEW.distance_gps_km * 100
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trips_distance BEFORE INSERT OR UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION calculate_trip_distance();
