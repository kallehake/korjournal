import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseUser } from '../_shared/supabase.ts';

/**
 * Export trips to PDF (Skatteverket-compliant format)
 * Returns HTML that can be printed as PDF by the client
 *
 * Query params: date_from, date_to, vehicle_id, driver_id, trip_type
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

    // Get organization + current user info
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, organization_id, organizations(name, org_number)')
      .eq('id', user.id)
      .single();

    // Build trip query
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

    const allTrips = trips ?? [];

    // Helper: get distance (use odometer diff if distance_km is null)
    const getDist = (t: any): number => {
      if (t.distance_km != null) return t.distance_km;
      if (t.odometer_end != null && t.odometer_start != null) return t.odometer_end - t.odometer_start;
      return 0;
    };

    const businessTrips = allTrips.filter((t: any) => t.trip_type === 'business');
    const privateTrips = allTrips.filter((t: any) => t.trip_type === 'private');
    const totalBusiness = businessTrips.reduce((s: number, t: any) => s + getDist(t), 0);
    const totalPrivate = privateTrips.reduce((s: number, t: any) => s + getDist(t), 0);

    // Per-vehicle summary
    const vehicleMap: Record<string, { regNr: string; business: number; private: number; trips: number }> = {};
    for (const t of allTrips) {
      const regNr = t.vehicle?.registration_number ?? 'Okänt';
      if (!vehicleMap[regNr]) vehicleMap[regNr] = { regNr, business: 0, private: 0, trips: 0 };
      vehicleMap[regNr].trips++;
      if (t.trip_type === 'business') vehicleMap[regNr].business += getDist(t);
      else vehicleMap[regNr].private += getDist(t);
    }
    const vehicleSummaryRows = Object.values(vehicleMap).map((v) => `
      <tr>
        <td class="font-mono">${v.regNr}</td>
        <td>${v.trips}</td>
        <td>${v.business.toFixed(1)} km</td>
        <td>${v.private.toFixed(1)} km</td>
        <td><strong>${(v.business + v.private).toFixed(1)} km</strong></td>
      </tr>
    `).join('');

    const orgName = (profile as any)?.organizations?.name ?? '';
    const orgNumber = (profile as any)?.organizations?.org_number ?? '';
    const signerName = (profile as any)?.full_name ?? '';

    const formatTime = (ts: string | null) => {
      if (!ts) return '';
      return new Date(ts).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (d: string) => {
      // YYYY-MM-DD → stays as is, already readable
      return d;
    };

    const tripRows = allTrips.map((trip: any) => {
      const dist = getDist(trip);
      return `
      <tr>
        <td>${formatDate(trip.date)}</td>
        <td>${formatTime(trip.start_time)}</td>
        <td>${formatTime(trip.end_time)}</td>
        <td class="font-mono">${trip.vehicle?.registration_number ?? ''}</td>
        <td>${trip.driver?.full_name ?? ''}</td>
        <td class="num">${trip.odometer_start?.toLocaleString('sv-SE') ?? ''}</td>
        <td class="num">${trip.odometer_end?.toLocaleString('sv-SE') ?? ''}</td>
        <td class="num">${dist > 0 ? dist.toFixed(1) : ''}</td>
        <td>${trip.start_address ?? ''}</td>
        <td>${trip.end_address ?? ''}</td>
        <td>${trip.purpose ?? ''}</td>
        <td>${trip.visited_person ?? ''}</td>
        <td class="${trip.trip_type === 'business' ? 'business' : 'private'}">
          ${trip.trip_type === 'business' ? 'Tjänst' : 'Privat'}
        </td>
      </tr>
    `;
    }).join('');

    const generatedAt = new Date().toLocaleString('sv-SE');

    const html = `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <title>Körjournal ${dateFrom} \u2013 ${dateTo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9px; padding: 12mm; color: #222; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    h3 { font-size: 11px; margin-bottom: 6px; color: #333; }
    .header { margin-bottom: 12px; border-bottom: 2px solid #222; padding-bottom: 8px; }
    .header-org { font-size: 11px; color: #555; margin-bottom: 2px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, auto); gap: 6px 24px; margin-bottom: 14px; }
    .meta-item strong { display: block; font-size: 8px; text-transform: uppercase; color: #888; margin-bottom: 1px; }
    .meta-item span { font-size: 10px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    th { background: #eee; padding: 4px 3px; text-align: left; font-size: 8px;
         text-transform: uppercase; border: 1px solid #bbb; white-space: nowrap; }
    td { padding: 3px; border: 1px solid #ddd; font-size: 9px; vertical-align: top; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .num { text-align: right; }
    .font-mono { font-family: monospace; font-size: 9px; }
    .business { color: #1d4ed8; font-weight: bold; }
    .private { color: #7c3aed; font-weight: bold; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 20px; }
    .summary-box { border: 1px solid #ddd; border-radius: 4px; padding: 10px; }
    .summary-box h3 { border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; }
    .summary-table { width: 100%; }
    .summary-table td { border: none; padding: 2px 4px; font-size: 9px; }
    .summary-table td:last-child { text-align: right; font-weight: bold; }
    .total-row td { border-top: 1px solid #ccc; font-weight: bold; }
    .signature-section { margin-top: 24px; page-break-inside: avoid; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 12px; }
    .sig-line { border-top: 1px solid #333; padding-top: 4px; font-size: 8px; color: #666; }
    .footer { margin-top: 20px; font-size: 8px; color: #aaa; border-top: 1px solid #eee; padding-top: 6px; }
    @media print {
      body { padding: 8mm; }
      @page { size: A4 landscape; margin: 8mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

  <div class="header">
    <h1>Körjournal</h1>
    <p class="header-org">${orgName}${orgNumber ? ` &mdash; Org.nr ${orgNumber}` : ''}</p>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><strong>Period</strong><span>${dateFrom} &ndash; ${dateTo}</span></div>
    <div class="meta-item"><strong>Antal resor</strong><span>${allTrips.length}</span></div>
    <div class="meta-item"><strong>Tjänsteresor</strong><span>${totalBusiness.toFixed(1)} km</span></div>
    <div class="meta-item"><strong>Privatresor</strong><span>${totalPrivate.toFixed(1)} km</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Start</th>
        <th>Slut</th>
        <th>Reg.nr</th>
        <th>F\u00f6rare</th>
        <th>M\u00e4tare start</th>
        <th>M\u00e4tare slut</th>
        <th>Str\u00e4cka (km)</th>
        <th>Fr\u00e5n</th>
        <th>Till</th>
        <th>\u00c4ndam\u00e5l</th>
        <th>Bes\u00f6kt</th>
        <th>Typ</th>
      </tr>
    </thead>
    <tbody>
      ${tripRows || '<tr><td colspan="13" style="text-align:center;padding:12px;color:#999">Inga resor under perioden</td></tr>'}
    </tbody>
  </table>

  <div class="summary-grid">
    <div class="summary-box">
      <h3>Sammanfattning</h3>
      <table class="summary-table">
        <tr><td>Tj\u00e4nsteresor</td><td>${businessTrips.length} st</td><td>${totalBusiness.toFixed(1)} km</td></tr>
        <tr><td>Privatresor</td><td>${privateTrips.length} st</td><td>${totalPrivate.toFixed(1)} km</td></tr>
        <tr class="total-row"><td>Totalt</td><td>${allTrips.length} st</td><td>${(totalBusiness + totalPrivate).toFixed(1)} km</td></tr>
      </table>
    </div>

    <div class="summary-box">
      <h3>Per fordon</h3>
      <table class="summary-table">
        <tr>
          <td><strong>Reg.nr</strong></td>
          <td><strong>Resor</strong></td>
          <td><strong>Tj\u00e4nst</strong></td>
          <td><strong>Privat</strong></td>
          <td><strong>Totalt</strong></td>
        </tr>
        ${vehicleSummaryRows || '<tr><td colspan="5">–</td></tr>'}
      </table>
    </div>
  </div>

  <div class="signature-section">
    <h3>Underskrift</h3>
    <p style="font-size:8px;color:#666;margin-bottom:16px">
      Jag intygar att k\u00f6rjournalen \u00e4r korrekt ifylld och att tj\u00e4nsteresor skett i arbetsgivarens verksamhet.
    </p>
    <div class="sig-grid">
      <div>
        <div style="height:32px"></div>
        <div class="sig-line">Datum och namnteckning &mdash; F\u00f6rare / Ansvarig: ${signerName}</div>
      </div>
      <div>
        <div style="height:32px"></div>
        <div class="sig-line">Datum och namnteckning &mdash; Arbetsgivare / Attesterare</div>
      </div>
    </div>
  </div>

  <div class="footer">
    Genererad: ${generatedAt} | Digital k\u00f6rjournal &mdash; uppfyller Skatteverkets krav (SKV A 2005:32)
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
