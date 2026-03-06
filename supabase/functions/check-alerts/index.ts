import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseAdmin } from '../_shared/supabase.ts';

/**
 * Scheduled function to check for alert conditions
 * Run via Supabase cron: every hour
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();
    const alerts: Array<{
      organization_id: string;
      alert_type: string;
      driver_id?: string;
      vehicle_id?: string;
      trip_id?: string;
      title: string;
      message: string;
    }> = [];

    // Get all enabled alert rules
    const { data: rules } = await supabase
      .from('alert_rules')
      .select('*')
      .eq('is_enabled', true);

    if (!rules?.length) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orgIds = [...new Set(rules.map((r: any) => r.organization_id))];

    for (const orgId of orgIds) {
      const orgRules = rules.filter((r: any) => r.organization_id === orgId);

      // Check: Odometer deviation (>10%)
      if (orgRules.some((r: any) => r.alert_type === 'odometer_deviation')) {
        const threshold = orgRules.find((r: any) => r.alert_type === 'odometer_deviation')?.threshold_value ?? 10;
        const { data: deviations } = await supabase
          .from('trips')
          .select('id, driver_id, vehicle_id, distance_deviation_pct, start_address, end_address')
          .eq('organization_id', orgId)
          .eq('status', 'completed')
          .gt('distance_deviation_pct', threshold)
          .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour
          .order('created_at', { ascending: false });

        for (const trip of deviations ?? []) {
          alerts.push({
            organization_id: orgId,
            alert_type: 'odometer_deviation',
            driver_id: trip.driver_id,
            vehicle_id: trip.vehicle_id,
            trip_id: trip.id,
            title: `Mätaravvikelse ${trip.distance_deviation_pct?.toFixed(1)}%`,
            message: `Resa ${trip.start_address} → ${trip.end_address} har ${trip.distance_deviation_pct?.toFixed(1)}% avvikelse mellan mätare och GPS.`,
          });
        }
      }

      // Check: Missing purpose on completed business trips
      if (orgRules.some((r: any) => r.alert_type === 'missing_purpose')) {
        const { data: missing } = await supabase
          .from('trips')
          .select('id, driver_id, vehicle_id, date, start_address')
          .eq('organization_id', orgId)
          .eq('status', 'completed')
          .eq('trip_type', 'business')
          .is('purpose', null)
          .gte('date', new Date(Date.now() - 86400000 * 7).toISOString().split('T')[0]); // Last 7 days

        for (const trip of missing ?? []) {
          alerts.push({
            organization_id: orgId,
            alert_type: 'missing_purpose',
            driver_id: trip.driver_id,
            trip_id: trip.id,
            title: 'Resa utan ändamål',
            message: `Tjänsteresa ${trip.date} från ${trip.start_address} saknar ändamål. Skatteverket kräver detta.`,
          });
        }
      }

      // Check: No trips in 7/14 days per vehicle
      for (const checkDays of [7, 14]) {
        const alertType = checkDays === 7 ? 'no_trips_7d' : 'no_trips_14d';
        if (!orgRules.some((r: any) => r.alert_type === alertType)) continue;

        const { data: vehicles } = await supabase
          .from('vehicles')
          .select('id, registration_number')
          .eq('organization_id', orgId)
          .eq('is_active', true);

        for (const vehicle of vehicles ?? []) {
          const { count } = await supabase
            .from('trips')
            .select('id', { count: 'exact', head: true })
            .eq('vehicle_id', vehicle.id)
            .gte('date', new Date(Date.now() - 86400000 * checkDays).toISOString().split('T')[0]);

          if (count === 0) {
            alerts.push({
              organization_id: orgId,
              alert_type: alertType,
              vehicle_id: vehicle.id,
              title: `Inga resor på ${checkDays} dagar`,
              message: `Fordon ${vehicle.registration_number} har inte registrerat någon resa på ${checkDays} dagar.`,
            });
          }
        }
      }
    }

    // Insert alerts (avoid duplicates by checking existing unresolved alerts)
    let inserted = 0;
    for (const alert of alerts) {
      const { count } = await supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', alert.organization_id)
        .eq('alert_type', alert.alert_type)
        .eq('is_resolved', false)
        .eq('trip_id', alert.trip_id ?? '')
        .eq('vehicle_id', alert.vehicle_id ?? '');

      if (count === 0) {
        await supabase.from('alerts').insert(alert);
        inserted++;
      }
    }

    return new Response(JSON.stringify({ checked: alerts.length, inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
