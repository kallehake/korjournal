import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseUser } from '../_shared/supabase.ts';

/**
 * Export trips to Excel (Skatteverket-compliant format)
 *
 * Query params:
 * - date_from: YYYY-MM-DD
 * - date_to: YYYY-MM-DD
 * - vehicle_id: UUID (optional)
 * - driver_id: UUID (optional)
 * - customer_id: UUID (optional)
 * - trip_type: business | private (optional)
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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');
    const vehicleId = url.searchParams.get('vehicle_id');
    const driverId = url.searchParams.get('driver_id');
    const customerId = url.searchParams.get('customer_id');
    const tripType = url.searchParams.get('trip_type');

    if (!dateFrom || !dateTo) {
      return new Response(JSON.stringify({ error: 'date_from and date_to required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build query
    let query = supabase
      .from('trips')
      .select(`
        *,
        driver:profiles!driver_id(full_name),
        vehicle:vehicles!vehicle_id(registration_number, make, model),
        customer:customers!customer_id(name)
      `)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .eq('status', 'completed')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (vehicleId) query = query.eq('vehicle_id', vehicleId);
    if (driverId) query = query.eq('driver_id', driverId);
    if (customerId) query = query.eq('customer_id', customerId);
    if (tripType) query = query.eq('trip_type', tripType);

    const { data: trips, error } = await query;
    if (error) throw error;

    // Generate CSV (tab-separated for Excel compatibility)
    // Skatteverket format columns
    const headers = [
      'Datum',
      'Starttid',
      'Sluttid',
      'Fordon',
      'Förare',
      'Mätarställning start (km)',
      'Mätarställning slut (km)',
      'Körd sträcka (km)',
      'Startadress',
      'Slutadress',
      'Ändamål',
      'Besökt person/företag',
      'Kund',
      'Restyp',
      'Anteckningar',
    ];

    const rows = (trips ?? []).map((trip: any) => [
      trip.date,
      trip.start_time ? new Date(trip.start_time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '',
      trip.end_time ? new Date(trip.end_time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '',
      trip.vehicle ? `${trip.vehicle.registration_number}${trip.vehicle.make ? ` (${trip.vehicle.make} ${trip.vehicle.model ?? ''})` : ''}` : '',
      trip.driver?.full_name ?? '',
      trip.odometer_start?.toString() ?? '',
      trip.odometer_end?.toString() ?? '',
      trip.distance_km?.toString() ?? '',
      trip.start_address ?? '',
      trip.end_address ?? '',
      trip.purpose ?? '',
      trip.visited_person ?? '',
      trip.customer?.name ?? '',
      trip.trip_type === 'business' ? 'Tjänsteresa' : 'Privatresa',
      trip.notes ?? '',
    ]);

    // BOM for Excel UTF-8 support
    const BOM = '\uFEFF';
    const csv = BOM + [
      headers.join('\t'),
      ...rows.map((row: string[]) => row.map(cell => `"${(cell ?? '').replace(/"/g, '""')}"`).join('\t')),
    ].join('\r\n');

    // Summary section
    const businessTrips = (trips ?? []).filter((t: any) => t.trip_type === 'business');
    const privateTrips = (trips ?? []).filter((t: any) => t.trip_type === 'private');
    const totalBusiness = businessTrips.reduce((sum: number, t: any) => sum + (t.distance_km ?? 0), 0);
    const totalPrivate = privateTrips.reduce((sum: number, t: any) => sum + (t.distance_km ?? 0), 0);

    const summary = [
      '',
      '',
      `"Sammanfattning"`,
      `"Period"\t"${dateFrom} - ${dateTo}"`,
      `"Antal tjänsteresor"\t"${businessTrips.length}"`,
      `"Antal privatresor"\t"${privateTrips.length}"`,
      `"Total tjänstekörning (km)"\t"${totalBusiness.toFixed(1)}"`,
      `"Total privatkörning (km)"\t"${totalPrivate.toFixed(1)}"`,
      `"Total körning (km)"\t"${(totalBusiness + totalPrivate).toFixed(1)}"`,
    ].join('\r\n');

    const fullCsv = csv + '\r\n' + summary;

    const filename = `korjournal_${dateFrom}_${dateTo}.csv`;

    return new Response(fullCsv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
