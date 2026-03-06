import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';

/**
 * Generate monthly reports for organizations
 * Run via cron on 1st of each month, or manually
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();

    // Determine period (previous month)
    const now = new Date();
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const month = now.getMonth() === 0 ? 12 : now.getMonth(); // Previous month
    const periodStart = `${year}-${month.toString().padStart(2, '0')}-01`;
    const periodEnd = new Date(year, month, 0).toISOString().split('T')[0]; // Last day

    // Get active report schedules
    const { data: schedules } = await supabase
      .from('report_schedules')
      .select('*')
      .eq('is_active', true);

    const reports: any[] = [];

    for (const schedule of schedules ?? []) {
      const orgId = schedule.organization_id;

      // Build trip query
      let tripQuery = supabase
        .from('trips')
        .select(`
          *,
          driver:profiles!driver_id(full_name),
          vehicle:vehicles!vehicle_id(registration_number, make, model, fuel_type, co2_per_km)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'completed')
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('date');

      if (schedule.vehicle_ids?.length) {
        tripQuery = tripQuery.in('vehicle_id', schedule.vehicle_ids);
      }
      if (schedule.driver_ids?.length) {
        tripQuery = tripQuery.in('driver_id', schedule.driver_ids);
      }

      const { data: trips } = await tripQuery;
      if (!trips?.length) continue;

      // Calculate summary
      const businessTrips = trips.filter((t: any) => t.trip_type === 'business');
      const privateTrips = trips.filter((t: any) => t.trip_type === 'private');
      const totalBusiness = businessTrips.reduce((s: number, t: any) => s + (t.distance_km ?? 0), 0);
      const totalPrivate = privateTrips.reduce((s: number, t: any) => s + (t.distance_km ?? 0), 0);

      // CO2 calculation
      let totalCo2 = 0;
      for (const trip of trips) {
        const co2PerKm = (trip.vehicle as any)?.co2_per_km ?? 150; // Default
        totalCo2 += ((trip.distance_km ?? 0) * co2PerKm) / 1000;
      }

      // Per-driver breakdown
      const driverMap = new Map<string, any>();
      for (const trip of trips) {
        const name = (trip.driver as any)?.full_name ?? 'Okänd';
        if (!driverMap.has(trip.driver_id)) {
          driverMap.set(trip.driver_id, {
            name,
            business_km: 0,
            private_km: 0,
            business_trips: 0,
            private_trips: 0,
          });
        }
        const d = driverMap.get(trip.driver_id)!;
        if (trip.trip_type === 'business') {
          d.business_km += trip.distance_km ?? 0;
          d.business_trips++;
        } else {
          d.private_km += trip.distance_km ?? 0;
          d.private_trips++;
        }
      }

      // Per-vehicle breakdown
      const vehicleMap = new Map<string, any>();
      for (const trip of trips) {
        const reg = (trip.vehicle as any)?.registration_number ?? 'Okänt';
        if (!vehicleMap.has(trip.vehicle_id)) {
          vehicleMap.set(trip.vehicle_id, {
            registration_number: reg,
            make: (trip.vehicle as any)?.make,
            total_km: 0,
            trip_count: 0,
          });
        }
        const v = vehicleMap.get(trip.vehicle_id)!;
        v.total_km += trip.distance_km ?? 0;
        v.trip_count++;
      }

      // Get fuel logs
      const { data: fuelLogs } = await supabase
        .from('fuel_logs')
        .select('*')
        .eq('organization_id', orgId)
        .gte('recorded_at', periodStart)
        .lte('recorded_at', periodEnd + 'T23:59:59');

      const totalFuelCost = (fuelLogs ?? []).reduce((s: number, f: any) => s + (f.cost_sek ?? 0), 0);
      const totalLiters = (fuelLogs ?? []).reduce((s: number, f: any) => s + (f.liters ?? 0), 0);

      // Get congestion tax
      const tripIds = trips.map((t: any) => t.id);
      const { data: congestion } = await supabase
        .from('congestion_tax_passages')
        .select('amount_sek')
        .in('trip_id', tripIds);

      const totalCongestion = (congestion ?? []).reduce((s: number, c: any) => s + (c.amount_sek ?? 0), 0);

      const reportData = {
        period: { year, month, start: periodStart, end: periodEnd },
        summary: {
          total_trips: trips.length,
          business_trips: businessTrips.length,
          private_trips: privateTrips.length,
          total_km: totalBusiness + totalPrivate,
          business_km: totalBusiness,
          private_km: totalPrivate,
          co2_kg: Math.round(totalCo2 * 10) / 10,
          fuel_cost_sek: totalFuelCost,
          fuel_liters: totalLiters,
          congestion_tax_sek: totalCongestion,
        },
        drivers: Array.from(driverMap.values()),
        vehicles: Array.from(vehicleMap.values()),
      };

      // Save report
      const { data: report } = await supabase
        .from('generated_reports')
        .insert({
          schedule_id: schedule.id,
          organization_id: orgId,
          report_type: 'monthly',
          period_start: periodStart,
          period_end: periodEnd,
          data: reportData,
        })
        .select()
        .single();

      // Update benefit reports
      for (const [driverId, driverData] of driverMap.entries()) {
        const totalKm = driverData.business_km + driverData.private_km;
        const privatePct = totalKm > 0 ? (driverData.private_km / totalKm) * 100 : 0;

        // Find vehicles driven by this driver
        const driverTrips = trips.filter((t: any) => t.driver_id === driverId);
        const vehicleIds = [...new Set(driverTrips.map((t: any) => t.vehicle_id))];

        for (const vId of vehicleIds) {
          const vTrips = driverTrips.filter((t: any) => t.vehicle_id === vId);
          const vBusiness = vTrips.filter((t: any) => t.trip_type === 'business');
          const vPrivate = vTrips.filter((t: any) => t.trip_type === 'private');
          const vBusinessKm = vBusiness.reduce((s: number, t: any) => s + (t.distance_km ?? 0), 0);
          const vPrivateKm = vPrivate.reduce((s: number, t: any) => s + (t.distance_km ?? 0), 0);
          const vTotalKm = vBusinessKm + vPrivateKm;

          await supabase
            .from('benefit_reports')
            .upsert({
              organization_id: orgId,
              vehicle_id: vId,
              driver_id: driverId,
              period_year: year,
              period_month: month,
              total_distance_km: vTotalKm,
              business_distance_km: vBusinessKm,
              private_distance_km: vPrivateKm,
              business_trips: vBusiness.length,
              private_trips: vPrivate.length,
              private_percentage: vTotalKm > 0 ? (vPrivateKm / vTotalKm) * 100 : 0,
            }, { onConflict: 'vehicle_id,driver_id,period_year,period_month' });
        }
      }

      // Update last_sent_at
      await supabase
        .from('report_schedules')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', schedule.id);

      reports.push(report);
    }

    return new Response(JSON.stringify({ generated: reports.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
