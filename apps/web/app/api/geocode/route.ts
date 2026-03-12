import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=sv`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Korjournal/1.0 (corporate fleet tracker)' },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 502 });
  }

  const data = await res.json();
  const addr = data.address ?? {};
  const city = addr.city ?? addr.town ?? addr.village ?? addr.municipality ?? '';
  const road = addr.road ?? '';
  const label = road ? `${road}, ${city}` : city || data.display_name?.split(',')[0] || '';

  return NextResponse.json({ label });
}
