import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = searchParams.get('origin');
  const destination = searchParams.get('destination');

  if (!origin || !destination) {
    return NextResponse.json({ error: 'Missing origin or destination' }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key' }, { status: 500 });
  }

  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&language=sv&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.routes?.length) {
    return NextResponse.json({ error: data.status }, { status: 400 });
  }

  const polyline = data.routes[0].overview_polyline.points;
  return NextResponse.json({ polyline });
}
