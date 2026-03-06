'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
import type { Geofence, GeofenceType } from '@korjournal/shared';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon paths in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface PinLocation {
  lat: number;
  lng: number;
  address: string;
}

interface Props {
  center: [number, number];
  flyTo: [number, number] | null;
  pin: PinLocation | null;
  geofences: Geofence[];
  formRadius: number;
  formType: GeofenceType;
  typeColors: Record<GeofenceType, string>;
  onMapClick: (lat: number, lng: number) => void;
  onGeofenceClick: (g: Geofence) => void;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToHandler({ flyTo }: { flyTo: [number, number] | null }) {
  const map = useMap();
  const prevFlyTo = useRef<[number, number] | null>(null);
  useEffect(() => {
    if (flyTo && flyTo !== prevFlyTo.current) {
      map.flyTo(flyTo, 15, { duration: 1 });
      prevFlyTo.current = flyTo;
    }
  }, [flyTo, map]);
  return null;
}

function makeColoredIcon(color: string, opacity: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
    <path fill="${color}" fill-opacity="${opacity}" stroke="white" stroke-width="1.5"
      d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z"/>
    <circle cx="12" cy="12" r="4" fill="white" fill-opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
  });
}

export default function GeofenceMap({
  center, flyTo, pin, geofences, formRadius, formType, typeColors, onMapClick, onGeofenceClick
}: Props) {
  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ width: '100%', height: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onClick={onMapClick} />
      <FlyToHandler flyTo={flyTo} />

      {/* Active pin */}
      {pin && (
        <>
          <Marker position={[pin.lat, pin.lng]} />
          <Circle
            center={[pin.lat, pin.lng]}
            radius={formRadius}
            pathOptions={{
              color: typeColors[formType],
              fillColor: typeColors[formType],
              fillOpacity: 0.18,
              weight: 2,
            }}
          />
        </>
      )}

      {/* Existing geofences */}
      {geofences.map((g) => (
        <div key={g.id}>
          <Marker
            position={[g.latitude, g.longitude]}
            icon={makeColoredIcon(typeColors[g.type], g.is_active ? 1 : 0.4)}
            eventHandlers={{ click: () => onGeofenceClick(g) }}
            title={g.name}
          />
          <Circle
            center={[g.latitude, g.longitude]}
            radius={g.radius_meters}
            pathOptions={{
              color: typeColors[g.type],
              fillColor: typeColors[g.type],
              fillOpacity: g.is_active ? 0.12 : 0.05,
              weight: 1.5,
              opacity: g.is_active ? 0.5 : 0.2,
            }}
          />
        </div>
      ))}
    </MapContainer>
  );
}
