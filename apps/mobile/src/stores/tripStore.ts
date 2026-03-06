import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Trip, GpsPointInsert } from '@korjournal/shared';
import {
  totalGpsDistance,
  detectCongestionTaxPassages,
  totalCongestionTax,
  calculateDriverScore,
  calculateCo2,
} from '@korjournal/shared';

interface GpsPointLocal {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

interface TripState {
  isTracking: boolean;
  currentTrip: Trip | null;
  gpsPoints: GpsPointLocal[];
  elapsedSeconds: number;
  error: string | null;

  startTrip: (params: {
    vehicleId: string;
    driverId: string;
    organizationId: string;
    startAddress: string;
    odometerStart: number;
    tripType: 'business' | 'private';
  }) => Promise<void>;

  addGpsPoint: (point: GpsPointLocal) => void;

  stopTrip: (params: {
    endAddress: string;
    odometerEnd: number;
    purpose?: string;
    visitedPerson?: string;
    customerId?: string;
  }) => Promise<void>;

  incrementElapsed: () => void;
  resetTrip: () => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  isTracking: false,
  currentTrip: null,
  gpsPoints: [],
  elapsedSeconds: 0,
  error: null,

  startTrip: async ({ vehicleId, driverId, organizationId, startAddress, odometerStart, tripType }) => {
    try {
      set({ error: null });

      const now = new Date().toISOString();
      const dateStr = now.split('T')[0];

      const { data, error } = await supabase
        .from('trips')
        .insert({
          vehicle_id: vehicleId,
          driver_id: driverId,
          organization_id: organizationId,
          start_address: startAddress,
          odometer_start: odometerStart,
          trip_type: tripType,
          status: 'active',
          date: dateStr,
          start_time: now,
          end_time: null,
          odometer_end: null,
          end_address: null,
          purpose: null,
          visited_person: null,
          customer_id: null,
          start_lat: null,
          start_lng: null,
          end_lat: null,
          end_lng: null,
          route_polyline: null,
          notes: null,
        })
        .select()
        .single();

      if (error) throw error;

      set({
        isTracking: true,
        currentTrip: data,
        gpsPoints: [],
        elapsedSeconds: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kunde inte starta resa';
      set({ error: message });
      throw err;
    }
  },

  addGpsPoint: (point: GpsPointLocal) => {
    set((state) => ({
      gpsPoints: [...state.gpsPoints, point],
    }));
  },

  stopTrip: async ({ endAddress, odometerEnd, purpose, visitedPerson, customerId }) => {
    const { currentTrip, gpsPoints } = get();
    if (!currentTrip) throw new Error('Ingen aktiv resa');

    try {
      set({ error: null });

      const now = new Date().toISOString();

      // Update the trip
      const { error: tripError } = await supabase
        .from('trips')
        .update({
          end_time: now,
          end_address: endAddress,
          odometer_end: odometerEnd,
          purpose: purpose ?? null,
          visited_person: visitedPerson ?? null,
          customer_id: customerId ?? null,
          status: 'completed',
        })
        .eq('id', currentTrip.id);

      if (tripError) throw tripError;

      // Batch insert GPS points
      if (gpsPoints.length > 0) {
        const pointsToInsert: GpsPointInsert[] = gpsPoints.map((p) => ({
          trip_id: currentTrip.id,
          latitude: p.latitude,
          longitude: p.longitude,
          altitude: p.altitude,
          accuracy: p.accuracy,
          speed: p.speed,
          heading: p.heading,
          timestamp: p.timestamp,
        }));

        const { error: gpsError } = await supabase
          .from('gps_points')
          .insert(pointsToInsert);

        if (gpsError) {
          console.error('Kunde inte spara GPS-punkter:', gpsError);
        }

        // Calculate GPS distance
        const gpsDistanceKm = totalGpsDistance(gpsPoints);
        await supabase
          .from('trips')
          .update({ distance_gps_km: gpsDistanceKm })
          .eq('id', currentTrip.id);

        // Detect congestion tax passages
        const passages = detectCongestionTaxPassages(gpsPoints);
        if (passages.length > 0) {
          const congestionInserts = passages.map((p) => ({
            trip_id: currentTrip.id,
            vehicle_id: currentTrip.vehicle_id,
            station_name: p.station.name,
            city: p.station.city,
            latitude: p.station.latitude,
            longitude: p.station.longitude,
            passage_time: p.timestamp,
            amount_sek: p.amount_sek,
            is_high_traffic: p.is_high_traffic,
          }));
          await supabase.from('congestion_tax_passages').insert(congestionInserts);

          const taxTotal = totalCongestionTax(passages);
          await supabase
            .from('trips')
            .update({ congestion_tax_total: taxTotal })
            .eq('id', currentTrip.id);
        }

        // Calculate driver score
        const score = calculateDriverScore(gpsPoints);
        await supabase.from('driver_scores').insert({
          driver_id: currentTrip.driver_id,
          trip_id: currentTrip.id,
          organization_id: currentTrip.organization_id,
          ...score,
        });

        // Calculate CO2 (fetch vehicle fuel type)
        const { data: vehicle } = await supabase
          .from('vehicles')
          .select('fuel_type, co2_per_km')
          .eq('id', currentTrip.vehicle_id)
          .single();

        if (vehicle) {
          const distKm = odometerEnd - currentTrip.odometer_start;
          const co2 = calculateCo2(distKm, vehicle.fuel_type, vehicle.co2_per_km);
          await supabase
            .from('trips')
            .update({ co2_emissions_kg: co2 })
            .eq('id', currentTrip.id);
        }
      }

      set({
        isTracking: false,
        currentTrip: null,
        gpsPoints: [],
        elapsedSeconds: 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kunde inte avsluta resa';
      set({ error: message });
      throw err;
    }
  },

  incrementElapsed: () => {
    set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 }));
  },

  resetTrip: () => {
    set({
      isTracking: false,
      currentTrip: null,
      gpsPoints: [],
      elapsedSeconds: 0,
      error: null,
    });
  },
}));
