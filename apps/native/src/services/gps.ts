import { Geolocation } from '@capacitor/geolocation';

export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&accept-language=sv`,
      { headers: { 'User-Agent': 'Korjournal/1.0' } },
    );
    const data = await res.json();
    const a = data.address ?? {};
    const road = a.road ? (a.house_number ? `${a.road} ${a.house_number}` : a.road) : null;
    const city = a.city ?? a.town ?? a.village ?? null;
    return [road, city].filter(Boolean).join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export async function calcRouteKm(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.[0]) {
      return Math.round(data.routes[0].distance / 1000);
    }
    return null;
  } catch {
    return null;
  }
}
