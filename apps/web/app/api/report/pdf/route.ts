import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const vehicleId = searchParams.get('vehicle_id') ?? undefined;
  const driverId = searchParams.get('driver_id') ?? undefined;
  const tripType = searchParams.get('trip_type') ?? undefined;

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'date_from and date_to required' }, { status: 400 });
  }

  // Verify caller is authenticated
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Use admin client so RLS doesn't block org-wide queries
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get org info
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, organization_id, organizations(name, org_number)')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Build trip query
  let query = supabase
    .from('trips')
    .select(`
      *,
      driver:profiles!driver_id(full_name),
      vehicle:vehicles!vehicle_id(registration_number, make, model),
      customer:customers!customer_id(name)
    `)
    .eq('organization_id', (profile as any).organization_id)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .eq('status', 'completed')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (vehicleId) query = query.eq('vehicle_id', vehicleId);
  if (driverId) query = query.eq('driver_id', driverId);
  if (tripType) query = query.eq('trip_type', tripType);

  const { data: trips, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allTrips = trips ?? [];

  // Helper: effective distance
  const getDist = (t: any): number => {
    if (t.distance_km != null) return Number(t.distance_km);
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
    const regNr = (t as any).vehicle?.registration_number ?? 'Okänt';
    if (!vehicleMap[regNr]) vehicleMap[regNr] = { regNr, business: 0, private: 0, trips: 0 };
    vehicleMap[regNr].trips++;
    if (t.trip_type === 'business') vehicleMap[regNr].business += getDist(t);
    else vehicleMap[regNr].private += getDist(t);
  }

  const orgName = (profile as any)?.organizations?.name ?? '';
  const orgNumber = (profile as any)?.organizations?.org_number ?? '';
  const signerName = (profile as any)?.full_name ?? '';

  const fmt = (ts: string | null) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  };

  const tripRows = allTrips.map((t: any) => {
    const dist = getDist(t);
    return `<tr>
      <td>${t.date}</td>
      <td>${fmt(t.start_time)}</td>
      <td>${fmt(t.end_time)}</td>
      <td class="mono">${t.vehicle?.registration_number ?? ''}</td>
      <td>${t.driver?.full_name ?? ''}</td>
      <td class="num">${t.odometer_start?.toLocaleString('sv-SE') ?? ''}</td>
      <td class="num">${t.odometer_end?.toLocaleString('sv-SE') ?? ''}</td>
      <td class="num">${dist > 0 ? dist.toFixed(1) : ''}</td>
      <td>${t.start_address ?? ''}</td>
      <td>${t.end_address ?? ''}</td>
      <td>${t.purpose ?? ''}</td>
      <td>${t.visited_person ?? ''}</td>
      <td class="${t.trip_type === 'business' ? 'biz' : 'priv'}">${t.trip_type === 'business' ? 'Tjänst' : 'Privat'}</td>
    </tr>`;
  }).join('');

  const vehicleRows = Object.values(vehicleMap).map((v) =>
    `<tr><td class="mono">${v.regNr}</td><td>${v.trips}</td><td>${v.business.toFixed(1)} km</td><td>${v.private.toFixed(1)} km</td><td><strong>${(v.business + v.private).toFixed(1)} km</strong></td></tr>`
  ).join('');

  const generatedAt = new Date().toLocaleString('sv-SE');

  const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>Körjournal ${dateFrom} – ${dateTo}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:9px;padding:12mm;color:#222}
h1{font-size:16px;margin-bottom:3px}
h3{font-size:11px;margin-bottom:6px;color:#333}
.header{margin-bottom:12px;border-bottom:2px solid #222;padding-bottom:8px}
.org{font-size:11px;color:#555}
.meta{display:grid;grid-template-columns:repeat(4,auto);gap:6px 24px;margin-bottom:14px}
.meta strong{display:block;font-size:8px;text-transform:uppercase;color:#888;margin-bottom:1px}
.meta span{font-size:10px;font-weight:bold}
table{width:100%;border-collapse:collapse;margin-bottom:18px}
th{background:#eee;padding:4px 3px;text-align:left;font-size:8px;text-transform:uppercase;border:1px solid #bbb;white-space:nowrap}
td{padding:3px;border:1px solid #ddd;font-size:9px;vertical-align:top}
tr:nth-child(even) td{background:#f9f9f9}
.num{text-align:right}
.mono{font-family:monospace}
.biz{color:#1d4ed8;font-weight:bold}
.priv{color:#7c3aed;font-weight:bold}
.sum-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:20px}
.sum-box{border:1px solid #ddd;border-radius:4px;padding:10px}
.sum-box h3{border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:8px}
.sum-box table{margin:0}
.sum-box td{border:none;padding:2px 4px}
.sum-box td:last-child{text-align:right;font-weight:bold}
.tot td{border-top:1px solid #ccc;font-weight:bold}
.sig{margin-top:24px;page-break-inside:avoid}
.sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:12px}
.sig-line{border-top:1px solid #333;padding-top:4px;font-size:8px;color:#666}
.footer{margin-top:20px;font-size:8px;color:#aaa;border-top:1px solid #eee;padding-top:6px}
@media print{body{padding:8mm}@page{size:A4 landscape;margin:8mm}}
</style>
</head>
<body>
<div class="header">
  <h1>Körjournal</h1>
  <p class="org">${orgName}${orgNumber ? ` &mdash; Org.nr ${orgNumber}` : ''}</p>
</div>
<div class="meta">
  <div><strong>Period</strong><span>${dateFrom} &ndash; ${dateTo}</span></div>
  <div><strong>Antal resor</strong><span>${allTrips.length}</span></div>
  <div><strong>Tjänsteresor</strong><span>${totalBusiness.toFixed(1)} km</span></div>
  <div><strong>Privatresor</strong><span>${totalPrivate.toFixed(1)} km</span></div>
</div>
<table>
  <thead><tr>
    <th>Datum</th><th>Start</th><th>Slut</th><th>Reg.nr</th><th>Förare</th>
    <th>Mätare start</th><th>Mätare slut</th><th>Sträcka (km)</th>
    <th>Från</th><th>Till</th><th>Ändamål</th><th>Besökt</th><th>Typ</th>
  </tr></thead>
  <tbody>${tripRows || '<tr><td colspan="13" style="text-align:center;padding:12px;color:#999">Inga resor under perioden</td></tr>'}</tbody>
</table>
<div class="sum-grid">
  <div class="sum-box">
    <h3>Sammanfattning</h3>
    <table>
      <tr><td>Tjänsteresor</td><td>${businessTrips.length} st</td><td>${totalBusiness.toFixed(1)} km</td></tr>
      <tr><td>Privatresor</td><td>${privateTrips.length} st</td><td>${totalPrivate.toFixed(1)} km</td></tr>
      <tr class="tot"><td>Totalt</td><td>${allTrips.length} st</td><td>${(totalBusiness + totalPrivate).toFixed(1)} km</td></tr>
    </table>
  </div>
  <div class="sum-box">
    <h3>Per fordon</h3>
    <table>
      <tr><td><strong>Reg.nr</strong></td><td><strong>Resor</strong></td><td><strong>Tjänst</strong></td><td><strong>Privat</strong></td><td><strong>Totalt</strong></td></tr>
      ${vehicleRows || '<tr><td colspan="5">&ndash;</td></tr>'}
    </table>
  </div>
</div>
<div class="sig">
  <h3>Underskrift</h3>
  <p style="font-size:8px;color:#666;margin-bottom:16px">Jag intygar att körjournalen är korrekt ifylld och att tjänsteresor skett i arbetsgivarens verksamhet.</p>
  <div class="sig-grid">
    <div><div style="height:32px"></div><div class="sig-line">Datum och namnteckning &mdash; Förare / Ansvarig: ${signerName}</div></div>
    <div><div style="height:32px"></div><div class="sig-line">Datum och namnteckning &mdash; Arbetsgivare / Attesterare</div></div>
  </div>
</div>
<div class="footer">Genererad: ${generatedAt} | Digital körjournal &mdash; uppfyller Skatteverkets krav (SKV A 2005:32)</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
