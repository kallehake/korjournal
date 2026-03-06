import { haversineDistance } from './haversine';
import type { Geofence } from '../types/extended';

/**
 * Check if a point is inside a geofence
 */
export function isInsideGeofence(
  latitude: number,
  longitude: number,
  geofence: Geofence
): boolean {
  const dist = haversineDistance(
    latitude,
    longitude,
    geofence.latitude,
    geofence.longitude
  ) * 1000; // km -> meters
  return dist <= geofence.radius_meters;
}

/**
 * Find which geofence (if any) a point is inside
 */
export function findMatchingGeofence(
  latitude: number,
  longitude: number,
  geofences: Geofence[]
): Geofence | null {
  for (const gf of geofences) {
    if (!gf.is_active) continue;
    if (isInsideGeofence(latitude, longitude, gf)) {
      return gf;
    }
  }
  return null;
}

/**
 * Auto-classify a trip based on start/end geofences
 * Rules:
 * - Start at home -> probably leaving for work = business
 * - End at home -> probably coming home = private (unless visited customer)
 * - Start/end at office -> business
 * - Any geofence with explicit auto_trip_type -> use that
 */
export function autoClassifyTrip(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  geofences: Geofence[]
): 'business' | 'private' | null {
  const startGf = findMatchingGeofence(startLat, startLng, geofences);
  const endGf = findMatchingGeofence(endLat, endLng, geofences);

  // Check explicit auto_trip_type rules
  if (startGf?.auto_trip_type) return startGf.auto_trip_type as 'business' | 'private';
  if (endGf?.auto_trip_type) return endGf.auto_trip_type as 'business' | 'private';

  // Heuristic classification
  if (startGf?.type === 'office' || endGf?.type === 'office') return 'business';
  if (endGf?.type === 'customer') return 'business';
  if (startGf?.type === 'home' && endGf?.type === 'home') return 'private';

  return null; // Cannot determine
}
