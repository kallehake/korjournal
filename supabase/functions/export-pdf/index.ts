import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseUser } from '../_shared/supabase.ts';

/**
 * Export trips to PDF (Skatteverket-compliant format)
 * Returns HTML that can be rendered as PDF by the client
 *
 * Query params same as export-excel
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
    const tripType = url.searchParams.get('trip_type');

    if (!dateFrom || !dateTo) {
      return new Response(JSON.stringify({ error: 'date_from and date_to required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get organization info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, organization_id, organizations(name, org_number)')
      .eq('id', user.id)
      .single();

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
    if (tripType) query = query.eq('trip_type', tripType);

    const { data: trips, error } = await query;
    if (error) throw error;

    const businessTrips = (trips ?? []).filter((t: any) => t.trip_type === 'business');
    const privateTrips = (trips ?? []).filter((t: any) => t.trip_type === 'private');
    const totalBusiness = businessTrips.reduce((s: number, t: any) => s + (t.distance_km ?? 0), 0);
    const totalPrivate = privateTrips.reduce((s: number, t: any) => s + (t.distance_km ?? 0), 0);

    const orgName = (profile as any)?.organizations?.name ?? '';
    const orgNumber = (profile as any)?.organizations?.org_number ?? '';

    const formatTime = (ts: string | null) => {
      if (!ts) return '';
      return new Date(ts).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    };

    const tripRows = (trips ?? []).map((trip: any) => `
      <tr>
        <td>${trip.date}</td>
        <td>${formatTime(trip.start_time)}</td>
        <td>${formatTime(trip.end_time)}</td>
        <td>${trip.vehicle?.registration_number ?? ''}</td>
        <td>${trip.odometer_start ?? ''}</td>
        <td>${trip.odometer_end ?? ''}</td>
        <td>${trip.distance_km?.toFixed(1) ?? ''}</td>
        <td>${trip.start_address ?? ''}</td>
        <td>${trip.end_address ?? ''}</td>
        <td>${trip.purpose ?? ''}</td>
        <td>${trip.visited_person ?? ''}</td>
        <td class="${trip.trip_type === 'business' ? 'business' : 'private'}">
          ${trip.trip_type === 'business' ? 'Tjänst' : 'Privat'}
        </td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <title>Körjournal ${dateFrom} - ${dateTo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; font-size: 10px; padding: 15mm; color: #333; }
    h1 { font-size: 18px; margin-bottom: 5px; }
    .header { margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .header p { font-size: 11px; color: #666; }
    .meta { display: flex; gap: 30px; margin-bottom: 15px; font-size: 11px; }
    .meta strong { display: block; color: #666; font-size: 9px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f0f0f0; padding: 6px 4px; text-align: left; font-size: 9px;
         text-transform: uppercase; border: 1px solid #ccc; }
    td { padding: 4px; border: 1px solid #ddd; font-size: 10px; }
    tr:nth-child(even) { background: #fafafa; }
    .business { color: #2563eb; font-weight: bold; }
    .private { color: #9333ea; font-weight: bold; }
    .summary { margin-top: 20px; }
    .summary table { width: auto; }
    .summary td { padding: 4px 12px; font-size: 11px; }
    .summary td:last-child { text-align: right; font-weight: bold; }
    .footer { margin-top: 30px; font-size: 9px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
    @media print {
      body { padding: 10mm; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Körjournal</h1>
    <p>${orgName}${orgNumber ? ` (${orgNumber})` : ''}</p>
  </div>

  <div class="meta">
    <div><strong>Period</strong>${dateFrom} &mdash; ${dateTo}</div>
    <div><strong>Antal resor</strong>${(trips ?? []).length}</div>
    <div><strong>Total sträcka</strong>${(totalBusiness + totalPrivate).toFixed(1)} km</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Start</th>
        <th>Slut</th>
        <th>Fordon</th>
        <th>Mätare start</th>
        <th>Mätare slut</th>
        <th>Sträcka</th>
        <th>Från</th>
        <th>Till</th>
        <th>Ändamål</th>
        <th>Besökt</th>
        <th>Typ</th>
      </tr>
    </thead>
    <tbody>
      ${tripRows}
    </tbody>
  </table>

  <div class="summary">
    <h3>Sammanfattning</h3>
    <table>
      <tr><td>Tjänsteresor</td><td>${businessTrips.length} st</td><td>${totalBusiness.toFixed(1)} km</td></tr>
      <tr><td>Privatresor</td><td>${privateTrips.length} st</td><td>${totalPrivate.toFixed(1)} km</td></tr>
      <tr><td><strong>Totalt</strong></td><td><strong>${(trips ?? []).length} st</strong></td><td><strong>${(totalBusiness + totalPrivate).toFixed(1)} km</strong></td></tr>
    </table>
  </div>

  <div class="footer">
    <p>Genererad: ${new Date().toLocaleString('sv-SE')} | Körjournal - Digital körjournalapp</p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
