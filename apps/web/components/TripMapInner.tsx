'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';

interface GpsPoint { latitude: number; longitude: number; timestamp: string; }

interface Props {
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  gpsPoints?: GpsPoint[];
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push([lat * 1e-5, lng * 1e-5]);
  }
  return points;
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('leaflet').then(L => {
      if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
      else if (positions.length === 1) map.setView(positions[0], 14);
    });
  }, [map, positions]);
  return null;
}

export default function TripMapInner({ startLat, startLng, endLat, endLng, gpsPoints }: Props) {
  const hasGps = gpsPoints && gpsPoints.length > 0;
  const [googleRoute, setGoogleRoute] = useState<[number, number][] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [icons, setIcons] = useState<{ start: any; end: any } | null>(null);

  // Initialize Leaflet icons inside useEffect (browser only)
  useEffect(() => {
    import('leaflet').then(L => {
      const startIcon = new L.Icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
        className: 'leaflet-marker-start',
      });
      const endIcon = new L.Icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
      });
      setIcons({ start: startIcon, end: endIcon });
    });
  }, []);

  useEffect(() => {
    if (hasGps || !startLat || !startLng || !endLat || !endLng) return;
    setRouteLoading(true);
    fetch(`/api/directions?origin=${startLat},${startLng}&destination=${endLat},${endLng}`)
      .then(r => r.json())
      .then(data => { if (data.polyline) setGoogleRoute(decodePolyline(data.polyline)); })
      .catch(() => {})
      .finally(() => setRouteLoading(false));
  }, [hasGps, startLat, startLng, endLat, endLng]);

  const routePositions: [number, number][] = hasGps
    ? gpsPoints.map(p => [p.latitude, p.longitude])
    : googleRoute ?? (startLat && startLng && endLat && endLng
        ? [[startLat, startLng], [endLat, endLng]]
        : []);

  const center: [number, number] = startLat && startLng ? [startLat, startLng] : [59.33, 18.07];

  return (
    <div>
      <div className="h-80 rounded-lg overflow-hidden">
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds positions={routePositions} />

          {startLat && startLng && icons && (
            <Marker position={[startLat, startLng]} icon={icons.start}>
              <Popup>Start</Popup>
            </Marker>
          )}
          {endLat && endLng && icons && (
            <Marker position={[endLat, endLng]} icon={icons.end}>
              <Popup>Slut</Popup>
            </Marker>
          )}

          {routePositions.length > 1 && (
            <Polyline positions={routePositions} color="#2563eb" weight={4} />
          )}
        </MapContainer>
      </div>
      {!hasGps && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          {routeLoading
            ? 'Hämtar rutt från Google Maps...'
            : googleRoute
            ? 'Rutt beräknad av Google Maps (uppskattad)'
            : 'Inga GPS-punkter sparade'}
        </p>
      )}
    </div>
  );
}
