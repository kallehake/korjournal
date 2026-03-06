import { haversineDistance } from './haversine';
import type { CongestionTaxStation } from '../types/extended';

/**
 * Stockholm congestion tax stations with coordinates
 * Source: Transportstyrelsen
 */
export const stockholmStations: CongestionTaxStation[] = [
  { name: 'Esssingeleden Södra', city: 'Stockholm', latitude: 59.3098, longitude: 18.0017, radius_meters: 100 },
  { name: 'Essingeleden Norra', city: 'Stockholm', latitude: 59.3378, longitude: 17.9924, radius_meters: 100 },
  { name: 'Liljeholmen', city: 'Stockholm', latitude: 59.3107, longitude: 18.0236, radius_meters: 80 },
  { name: 'Skanstull', city: 'Stockholm', latitude: 59.3076, longitude: 18.0728, radius_meters: 80 },
  { name: 'Danvikstull', city: 'Stockholm', latitude: 59.3155, longitude: 18.1073, radius_meters: 80 },
  { name: 'Hornsgatan', city: 'Stockholm', latitude: 59.3170, longitude: 18.0486, radius_meters: 80 },
  { name: 'Mariebergsgatan', city: 'Stockholm', latitude: 59.3296, longitude: 18.0201, radius_meters: 80 },
  { name: 'Klarastrandsleden', city: 'Stockholm', latitude: 59.3396, longitude: 18.0329, radius_meters: 80 },
  { name: 'Solna/Ekelundsbron', city: 'Stockholm', latitude: 59.3472, longitude: 18.0179, radius_meters: 80 },
  { name: 'Norrtull', city: 'Stockholm', latitude: 59.3541, longitude: 18.0449, radius_meters: 80 },
  { name: 'Rosenlundsgatan', city: 'Stockholm', latitude: 59.3195, longitude: 18.0617, radius_meters: 80 },
  { name: 'Södra Länken / Hammarby Sjöstad', city: 'Stockholm', latitude: 59.2990, longitude: 18.0959, radius_meters: 100 },
  { name: 'Johanneshovsbron', city: 'Stockholm', latitude: 59.3029, longitude: 18.0783, radius_meters: 80 },
  { name: 'Lidingövägen', city: 'Stockholm', latitude: 59.3418, longitude: 18.0946, radius_meters: 80 },
];

/**
 * Göteborg congestion tax stations
 */
export const goteborgStations: CongestionTaxStation[] = [
  { name: 'E6 Tingstadstunneln', city: 'Göteborg', latitude: 57.7236, longitude: 11.9749, radius_meters: 100 },
  { name: 'E45 Marieholm', city: 'Göteborg', latitude: 57.7248, longitude: 11.9886, radius_meters: 100 },
  { name: 'Järntorget', city: 'Göteborg', latitude: 57.6997, longitude: 11.9520, radius_meters: 80 },
  { name: 'Friggagatan', city: 'Göteborg', latitude: 57.7123, longitude: 11.9788, radius_meters: 80 },
  { name: 'Göta Älvbron', city: 'Göteborg', latitude: 57.7118, longitude: 11.9682, radius_meters: 80 },
  { name: 'Linnéplatsen', city: 'Göteborg', latitude: 57.6932, longitude: 11.9511, radius_meters: 80 },
];

const allStations = [...stockholmStations, ...goteborgStations];

/**
 * Stockholm congestion tax rates (2024/2025)
 * Time-based: 06:00-06:29 = 15kr, 06:30-06:59 = 25kr, 07:00-07:29 = 35kr, 07:30-08:29 = 45kr, etc.
 */
function getStockholmTaxAmount(hour: number, minute: number): number {
  if (hour < 6 || hour >= 18 || (hour === 18 && minute >= 30)) return 0;
  if (hour === 6 && minute < 30) return 15;
  if (hour === 6) return 25;
  if (hour === 7 && minute < 30) return 35;
  if (hour < 9 || (hour === 8 && minute < 30)) return 45;
  if (hour < 9 || (hour === 8)) return 35;
  if (hour < 15 || (hour === 9 && minute < 30)) return 25;
  if (hour === 9) return 15;
  if (hour < 15) return 11;
  if (hour === 15 && minute < 30) return 25;
  if (hour === 15) return 35;
  if (hour === 16) return 45;
  if (hour === 17 && minute < 30) return 35;
  if (hour === 17) return 25;
  return 0;
}

/**
 * Simplified Stockholm tax schedule
 */
function getStockholmRate(date: Date): number {
  const h = date.getHours();
  const m = date.getMinutes();

  // Weekends and holidays = free
  const day = date.getDay();
  if (day === 0 || day === 6) return 0;

  // July = free
  if (date.getMonth() === 6) return 0;

  if (h < 6 || h >= 19) return 0;
  if (h === 6 && m < 30) return 15;
  if (h === 6) return 25;
  if (h === 7 && m < 30) return 35;
  if (h < 9) return 45;
  if (h === 9 && m < 30) return 25;
  if (h < 15) return 11;
  if (h === 15 && m < 30) return 25;
  if (h === 15) return 35;
  if (h < 17) return 45;
  if (h === 17 && m < 30) return 35;
  if (h === 17) return 25;
  if (h === 18 && m < 30) return 15;
  return 0;
}

function getGoteborgRate(date: Date): number {
  const h = date.getHours();
  const m = date.getMinutes();
  const day = date.getDay();
  if (day === 0 || day === 6) return 0;
  if (date.getMonth() === 6) return 0;

  if (h < 6 || h >= 19) return 0;
  if (h === 6 && m < 30) return 9;
  if (h === 6) return 16;
  if (h === 7 && m < 30) return 22;
  if (h < 9) return 22;
  if (h < 15) return 9;
  if (h === 15 && m < 30) return 16;
  if (h < 17) return 22;
  if (h === 17 && m < 30) return 16;
  if (h === 17) return 9;
  if (h === 18 && m < 30) return 9;
  return 0;
}

export interface DetectedPassage {
  station: CongestionTaxStation;
  timestamp: string;
  amount_sek: number;
  is_high_traffic: boolean;
}

/**
 * Detect congestion tax passages from a list of GPS points
 */
export function detectCongestionTaxPassages(
  gpsPoints: Array<{ latitude: number; longitude: number; timestamp: string }>
): DetectedPassage[] {
  const passages: DetectedPassage[] = [];
  const recentPassages = new Map<string, number>(); // station name -> last passage timestamp

  for (const point of gpsPoints) {
    for (const station of allStations) {
      const dist = haversineDistance(
        point.latitude,
        point.longitude,
        station.latitude,
        station.longitude
      ) * 1000; // Convert to meters

      if (dist <= station.radius_meters) {
        const pointTime = new Date(point.timestamp).getTime();
        const lastPass = recentPassages.get(station.name);

        // Multi-passage rule: ignore same station within 60 min
        if (lastPass && pointTime - lastPass < 60 * 60 * 1000) continue;

        const date = new Date(point.timestamp);
        const amount = station.city === 'Stockholm'
          ? getStockholmRate(date)
          : getGoteborgRate(date);

        if (amount > 0) {
          passages.push({
            station,
            timestamp: point.timestamp,
            amount_sek: amount,
            is_high_traffic: amount >= 35,
          });
          recentPassages.set(station.name, pointTime);
        }
      }
    }
  }

  return passages;
}

/**
 * Calculate total congestion tax for a trip
 */
export function totalCongestionTax(passages: DetectedPassage[]): number {
  // Max 135 SEK per day in Stockholm, 60 SEK in Göteborg
  const byDayCity = new Map<string, { total: number; max: number }>();

  for (const p of passages) {
    const day = p.timestamp.split('T')[0];
    const key = `${day}_${p.station.city}`;
    const max = p.station.city === 'Stockholm' ? 135 : 60;

    if (!byDayCity.has(key)) {
      byDayCity.set(key, { total: 0, max });
    }
    byDayCity.get(key)!.total += p.amount_sek;
  }

  let total = 0;
  for (const entry of byDayCity.values()) {
    total += Math.min(entry.total, entry.max);
  }
  return total;
}
