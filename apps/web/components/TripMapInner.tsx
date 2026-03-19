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
  const [icons, setIcons] = useState<{ start: any; end: any } | null>(null);

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

  const gpsLine: [number, number][] = (gpsPoints ?? []).map(p => [p.latitude, p.longitude]);

  // Bounds: prefer GPS track, fall back to start/end markers
  const boundsPositions: [number, number][] = gpsLine.length > 1
    ? gpsLine
    : [
        ...(startLat && startLng ? [[startLat, startLng] as [number, number]] : []),
        ...(endLat   && endLng   ? [[endLat,   endLng]   as [number, number]] : []),
      ];

  const center: [number, number] = startLat && startLng ? [startLat, startLng] : [59.33, 18.07];

  return (
    <div>
      <div className="h-80 rounded-lg overflow-hidden">
        <MapContainer center={center} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds positions={boundsPositions} />

          {/* Route line along GPS track */}
          {gpsLine.length > 1 && (
            <Polyline positions={gpsLine} color="#2563eb" weight={4} opacity={0.8} />
          )}

          {/* GPS waypoints as small dots */}
          {gpsLine.map((pos, i) => (
            <CircleMarker key={i} center={pos} radius={3} color="#2563eb" fillColor="#93c5fd" fillOpacity={0.8} weight={1}>
              <Popup>GPS-punkt {i + 1}</Popup>
            </CircleMarker>
          ))}

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
        </MapContainer>
      </div>
      {gpsLine.length > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-center">{gpsLine.length} GPS-punkter</p>
      )}
    </div>
  );
}
