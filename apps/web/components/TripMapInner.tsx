'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';

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
    import('leaflet').then(L => {
      if (positions.length > 1) map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
      else if (positions.length === 1) map.setView(positions[0], 14);
    });
  }, [map, positions]);
  return null;
}

export default function TripMapInner({ startLat, startLng, endLat, endLng, gpsPoints }: Props) {
  const [googleRoute, setGoogleRoute] = useState<[number, number][] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [icons, setIcons] = useState<{ start: any; end: any } | null>(null);

  // Initialize Leaflet icons inside useEffect (browser only)
  useEffect(() => {
    import('leaflet').then(L => {
      const base = {
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41] as [number, number],
        iconAnchor: [12, 41] as [number, number],
        popupAnchor: [1, -34] as [number, number],
        shadowSize: [41, 41] as [number, number],
      };
      setIcons({
        start: new L.Icon({ ...base, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' }),
        end:   new L.Icon({ ...base, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' }),
      });
    });
  }, []);

  // Always use Google Directions for the route line (actual roads)
  useEffect(() => {
    if (!startLat || !startLng || !endLat || !endLng) return;
    setRouteLoading(true);
    fetch(`/api/directions?origin=${startLat},${startLng}&destination=${endLat},${endLng}`)
      .then(r => r.json())
      .then(data => { if (data.polyline) setGoogleRoute(decodePolyline(data.polyline)); })
      .catch(() => {})
      .finally(() => setRouteLoading(false));
  }, [startLat, startLng, endLat, endLng]);

  // Route line: Google Directions road route, fallback to straight line
  const routeLine: [number, number][] = googleRoute
    ?? (startLat && startLng && endLat && endLng
        ? [[startLat, startLng], [endLat, endLng]]
        : []);

  // GPS intermediate points (for position markers, not the route)
  const gpsMarkers: [number, number][] = (gpsPoints ?? []).map(p => [p.latitude, p.longitude]);

  // All positions for fitting the map bounds
  const allPositions: [number, number][] = routeLine.length > 0 ? routeLine : gpsMarkers;

  const center: [number, number] = startLat && startLng ? [startLat, startLng] : [59.33, 18.07];

  return (
    <div>
      <div className="h-80 rounded-lg overflow-hidden">
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds positions={allPositions} />

          {/* Route line along actual roads */}
          {routeLine.length > 1 && (
            <Polyline positions={routeLine} color="#2563eb" weight={4} />
          )}

          {/* Start/end markers */}
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

          {/* GPS waypoints as small dots */}
          {gpsMarkers.map((pos, i) => (
            <CircleMarker key={i} center={pos} radius={4} color="#2563eb" fillColor="#93c5fd" fillOpacity={0.8} weight={2}>
              <Popup>GPS-punkt {i + 1}</Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="text-xs text-gray-400 mt-2 text-center">
        {routeLoading
          ? 'Hämtar vägkarta...'
          : googleRoute
          ? `Väg från Google Maps${gpsMarkers.length > 0 ? ` · ${gpsMarkers.length} GPS-punkter` : ''}`
          : 'Rak linje (Google Maps ej tillgänglig)'}
      </p>
    </div>
  );
}
