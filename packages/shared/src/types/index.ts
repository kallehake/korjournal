export { type Database, type Tables, type TablesInsert, type TablesUpdate, type Enums, type Json } from './database';
export * from './extended';

// Convenience type aliases
import type { Database } from './database';

export type Trip = Database['public']['Tables']['trips']['Row'];
export type TripInsert = Database['public']['Tables']['trips']['Insert'];
export type TripUpdate = Database['public']['Tables']['trips']['Update'];
export type Vehicle = Database['public']['Tables']['vehicles']['Row'];
export type VehicleInsert = Database['public']['Tables']['vehicles']['Insert'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type CustomerInsert = Database['public']['Tables']['customers']['Insert'];
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type GpsPoint = Database['public']['Tables']['gps_points']['Row'];
export type GpsPointInsert = Database['public']['Tables']['gps_points']['Insert'];
export type OdometerReading = Database['public']['Tables']['odometer_readings']['Row'];

export type TripType = Database['public']['Enums']['trip_type'];
export type TripStatus = Database['public']['Enums']['trip_status'];
export type FuelType = Database['public']['Enums']['fuel_type'];
export type UserRole = Database['public']['Enums']['user_role'];
export type AlertType = Database['public']['Enums']['alert_type'];
export type GeofenceType = Database['public']['Enums']['geofence_type'];

// App-specific types
export interface TripWithRelations {
  id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  odometer_start: number;
  odometer_end: number | null;
  start_address: string;
  end_address: string | null;
  purpose: string | null;
  visited_person: string | null;
  trip_type: TripType;
  status: TripStatus;
  distance_km: number | null;
  driver: { id: string; full_name: string } | null;
  vehicle: { id: string; registration_number: string; make: string | null; model: string | null } | null;
  customer: { id: string; name: string } | null;
}

export interface DashboardStats {
  totalTrips: number;
  totalDistanceKm: number;
  businessTrips: number;
  privateTrips: number;
  businessDistanceKm: number;
  privateDistanceKm: number;
  activeVehicles: number;
  activeDrivers: number;
}

export interface TripFilter {
  dateFrom?: string;
  dateTo?: string;
  driverId?: string;
  vehicleId?: string;
  customerId?: string;
  tripType?: TripType;
  status?: TripStatus;
  search?: string;
}

export interface ExportOptions {
  format: 'xlsx' | 'pdf';
  dateFrom: string;
  dateTo: string;
  vehicleId?: string;
  driverId?: string;
  customerId?: string;
  tripType?: TripType;
}
