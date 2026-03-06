import type { PrivateTripRule } from '../types/extended';

/**
 * Check if a private trip is allowed based on the rules
 */
export function isPrivateTripAllowed(
  rules: PrivateTripRule[],
  tripDate: Date,
  vehicleId: string,
  driverId: string
): { allowed: boolean; reason?: string } {
  const applicableRules = rules.filter(
    (r) =>
      r.is_active &&
      (!r.vehicle_id || r.vehicle_id === vehicleId) &&
      (!r.driver_id || r.driver_id === driverId)
  );

  if (applicableRules.length === 0) return { allowed: true };

  for (const rule of applicableRules) {
    // Check weekday
    const jsDay = tripDate.getDay(); // 0=Sun, 6=Sat
    const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon, 7=Sun
    if (!rule.allowed_weekdays.includes(isoDay)) {
      return {
        allowed: false,
        reason: `Privatresor inte tillåtna på ${weekdayName(isoDay)} enligt regel "${rule.name}"`,
      };
    }

    // Check time window
    const timeStr = `${tripDate.getHours().toString().padStart(2, '0')}:${tripDate.getMinutes().toString().padStart(2, '0')}`;
    if (rule.allowed_start_time && rule.allowed_end_time) {
      const inWindow = isInTimeWindow(timeStr, rule.allowed_start_time, rule.allowed_end_time);
      if (!inWindow) {
        return {
          allowed: false,
          reason: `Privatresor tillåtna ${rule.allowed_start_time}-${rule.allowed_end_time}, nuvarande tid: ${timeStr}`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Check if current month's private driving exceeds limits
 */
export function checkPrivateLimits(
  rules: PrivateTripRule[],
  vehicleId: string,
  driverId: string,
  currentMonthPrivateKm: number,
  currentMonthPrivateTrips: number,
  currentMonthTotalKm: number
): { exceeded: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let exceeded = false;

  const applicableRules = rules.filter(
    (r) =>
      r.is_active &&
      (!r.vehicle_id || r.vehicle_id === vehicleId) &&
      (!r.driver_id || r.driver_id === driverId)
  );

  for (const rule of applicableRules) {
    if (rule.max_private_km_per_month && currentMonthPrivateKm >= rule.max_private_km_per_month) {
      exceeded = true;
      warnings.push(
        `Privatkörning ${currentMonthPrivateKm.toFixed(0)} km överstiger gräns ${rule.max_private_km_per_month} km/månad`
      );
    }

    if (rule.max_private_trips_per_month && currentMonthPrivateTrips >= rule.max_private_trips_per_month) {
      exceeded = true;
      warnings.push(
        `Antal privatresor ${currentMonthPrivateTrips} överstiger gräns ${rule.max_private_trips_per_month}/månad`
      );
    }

    if (rule.max_private_percentage && currentMonthTotalKm > 0) {
      const pct = (currentMonthPrivateKm / currentMonthTotalKm) * 100;
      if (pct >= rule.max_private_percentage) {
        exceeded = true;
        warnings.push(
          `Privatkörning ${pct.toFixed(1)}% överstiger gräns ${rule.max_private_percentage}%`
        );
      }
    }
  }

  return { exceeded, warnings };
}

function isInTimeWindow(time: string, start: string, end: string): boolean {
  // Handle overnight windows (e.g., 17:00 - 07:00)
  if (start > end) {
    return time >= start || time <= end;
  }
  return time >= start && time <= end;
}

function weekdayName(isoDay: number): string {
  const names = ['', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
  return names[isoDay] ?? '';
}
