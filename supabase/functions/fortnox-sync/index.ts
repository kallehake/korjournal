import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseUser } from '../_shared/supabase.ts';

/**
 * Sync trip data to Fortnox/Visma/Hogia
 * Exports mileage reimbursement data as expense entries
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseUser(authHeader);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { provider, date_from, date_to, action } = body;

    // Get integration config
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', provider)
      .single();

    if (!integration || integration.status !== 'active') {
      return new Response(JSON.stringify({ error: `Integration ${provider} ej aktiv` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get trips for the period
    const { data: trips } = await supabase
      .from('trips')
      .select(`
        *,
        driver:profiles!driver_id(full_name),
        vehicle:vehicles!vehicle_id(registration_number)
      `)
      .eq('status', 'completed')
      .eq('trip_type', 'business')
      .gte('date', date_from)
      .lte('date', date_to)
      .order('date');

    if (!trips?.length) {
      return new Response(JSON.stringify({ synced: 0, message: 'Inga resor att synka' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Milersättning rate (2024: 25 kr/mil = 2.50 kr/km for own car)
    const mileageRate = integration.config?.mileage_rate ?? 2.50;

    if (action === 'preview') {
      // Return preview data without syncing
      const entries = trips.map((trip: any) => ({
        date: trip.date,
        description: `Tjänsteresa: ${trip.start_address} → ${trip.end_address ?? ''}${trip.purpose ? ` (${trip.purpose})` : ''}`,
        distance_km: trip.distance_km ?? 0,
        amount_sek: ((trip.distance_km ?? 0) * mileageRate),
        driver: (trip.driver as any)?.full_name,
        vehicle: (trip.vehicle as any)?.registration_number,
      }));

      const totalKm = entries.reduce((s: number, e: any) => s + e.distance_km, 0);
      const totalAmount = entries.reduce((s: number, e: any) => s + e.amount_sek, 0);

      return new Response(JSON.stringify({
        entries,
        summary: {
          total_trips: entries.length,
          total_km: totalKm,
          total_amount_sek: totalAmount,
          mileage_rate: mileageRate,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate Fortnox-compatible SIE format
    if (provider === 'fortnox') {
      const sieLines: string[] = [
        '#FLAGGA 0',
        '#FORMAT PC8',
        '#SIETYP 4',
        '#PROGRAM "Körjournal" 1.0',
        `#GEN ${new Date().toISOString().split('T')[0]}`,
        '#FNAMN "Milersättning"',
        '',
      ];

      let verNum = 1;
      for (const trip of trips) {
        const amount = ((trip.distance_km ?? 0) * mileageRate).toFixed(2);
        const desc = `Tjänsteresa ${trip.start_address} - ${trip.end_address ?? ''} ${(trip.distance_km ?? 0).toFixed(1)} km`;

        sieLines.push(`#VER "A" ${verNum} ${trip.date} "${desc}"`);
        sieLines.push('{');
        // Debit: Milersättning (account 7331)
        sieLines.push(`  #TRANS 7331 {} ${amount} "" "" "${desc}"`);
        // Credit: Skuld (account 2890)
        sieLines.push(`  #TRANS 2890 {} -${amount} "" "" "${desc}"`);
        sieLines.push('}');
        verNum++;
      }

      const sieContent = sieLines.join('\n');

      // Update sync timestamp
      await supabase
        .from('integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integration.id);

      return new Response(JSON.stringify({
        synced: trips.length,
        format: 'SIE4',
        content: sieContent,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generic JSON export for Visma/Hogia/Custom API
    const entries = trips.map((trip: any) => ({
      date: trip.date,
      account: '7331',
      amount: ((trip.distance_km ?? 0) * mileageRate).toFixed(2),
      description: `Tjänsteresa: ${trip.start_address} → ${trip.end_address ?? ''}`,
      distance_km: trip.distance_km,
      driver: (trip.driver as any)?.full_name,
      vehicle: (trip.vehicle as any)?.registration_number,
    }));

    await supabase
      .from('integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', integration.id);

    return new Response(JSON.stringify({ synced: trips.length, entries }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
