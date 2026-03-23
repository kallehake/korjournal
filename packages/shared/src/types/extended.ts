// ============================================
// Extended feature types
// ============================================

import type { Database } from './database';

type GeofenceType = Database['public']['Enums']['geofence_type'];
type FuelLogType = Database['public']['Enums']['fuel_log_type'];
type AlertType = Database['public']['Enums']['alert_type'];
type IntegrationProvider = Database['public']['Enums']['integration_provider'];
type IntegrationStatus = Database['public']['Enums']['integration_status'];

export interface Geofence {
  id: string;
  organization_id: string;
  driver_id: string | null;
  name: string;
  type: GeofenceType;
  latitude: number;
  longitude: number;
  radius_meters: number;
  auto_trip_type: string | null;
  customer_id: string | null;
  project_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CongestionTaxPassage {
  id: string;
  trip_id: string;
  vehicle_id: string;
  station_name: string;
  city: string;
  latitude: number;
  longitude: number;
  passage_time: string;
  amount_sek: number;
  is_high_traffic: boolean;
  created_at: string;
}

export interface FuelLog {
  id: string;
  vehicle_id: string;
  organization_id: string;
  recorded_by: string | null;
  log_type: FuelLogType;
  liters: number | null;
  kwh: number | null;
  cost_sek: number | null;
  odometer_km: number | null;
  station_name: string | null;
  is_full_tank: boolean;
  recorded_at: string;
  notes: string | null;
  created_at: string;
}

export interface DriverScore {
  id: string;
  driver_id: string;
  trip_id: string;
  organization_id: string;
  overall_score: number;
  acceleration_score: number | null;
  braking_score: number | null;
  speeding_score: number | null;
  idle_score: number | null;
  harsh_events: number;
  max_speed_kmh: number | null;
  avg_speed_kmh: number | null;
  idle_duration_seconds: number;
  scored_at: string;
}

export interface ChecklistTemplate {
  id: string;
  organization_id: string;
  name: string;
  items: Array<{ label: string; required: boolean }>;
  is_active: boolean;
  created_at: string;
}

export interface ChecklistResponse {
  id: string;
  template_id: string;
  vehicle_id: string;
  driver_id: string;
  organization_id: string;
  responses: Record<string, { checked: boolean; note?: string }>;
  all_passed: boolean;
  completed_at: string;
  notes: string | null;
  created_at: string;
}

export interface AlertRule {
  id: string;
  organization_id: string;
  alert_type: AlertType;
  is_enabled: boolean;
  threshold_value: number | null;
  notify_admin: boolean;
  notify_driver: boolean;
  notify_email: string[];
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  organization_id: string;
  alert_type: AlertType;
  driver_id: string | null;
  vehicle_id: string | null;
  trip_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReportSchedule {
  id: string;
  organization_id: string;
  name: string;
  frequency: string;
  day_of_month: number;
  recipients: string[];
  include_sections: string[];
  vehicle_ids: string[];
  driver_ids: string[];
  is_active: boolean;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrivateTripRule {
  id: string;
  organization_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  name: string;
  allowed_weekdays: number[];
  allowed_start_time: string;
  allowed_end_time: string;
  max_private_km_per_month: number | null;
  max_private_trips_per_month: number | null;
  max_private_percentage: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  organization_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  config: Record<string, any>;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface BenefitReport {
  id: string;
  organization_id: string;
  vehicle_id: string;
  driver_id: string;
  period_year: number;
  period_month: number;
  total_distance_km: number;
  business_distance_km: number;
  private_distance_km: number;
  business_trips: number;
  private_trips: number;
  private_percentage: number;
  benefit_value_sek: number | null;
  created_at: string;
}

// Congestion tax station definitions
export interface CongestionTaxStation {
  name: string;
  city: 'Stockholm' | 'Göteborg';
  latitude: number;
  longitude: number;
  radius_meters: number;
}

// Alert type labels in Swedish
export const alertTypeLabels: Record<AlertType, string> = {
  odometer_deviation: 'Mätaravvikelse (>10%)',
  driverless_trip: 'Resa utan förare',
  no_trips_7d: 'Inga resor på 7 dagar',
  no_trips_14d: 'Inga resor på 14 dagar',
  gps_lost: 'Tappad GPS-kontakt',
  speed_violation: 'Hastighetsöverträdelse',
  missing_purpose: 'Resa utan ändamål',
  private_limit_exceeded: 'Privatkörning över gräns',
  checklist_failed: 'Fordonskontroll ej godkänd',
};

export const geofenceTypeLabels: Record<GeofenceType, string> = {
  home: 'Hem',
  office: 'Kontor',
  customer: 'Kund',
  other: 'Övrigt',
};

export const integrationProviderLabels: Record<IntegrationProvider, string> = {
  fortnox: 'Fortnox',
  visma: 'Visma',
  hogia: 'Hogia',
  custom_api: 'Eget API',
};
