'use client';

import dynamic from 'next/dynamic';

interface GpsPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface TripMapProps {
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  gpsPoints?: GpsPoint[];
}

// Inner component loaded without SSR (Leaflet requires window)
const TripMapInner = dynamic(() => import('./TripMapInner'), { ssr: false, loading: () => (
  <div className="bg-gray-100 rounded-lg h-80 flex items-center justify-center text-gray-400">Laddar karta...</div>
)});

export default function TripMap(props: TripMapProps) {
  const hasCoords = props.startLat && props.startLng;
  if (!hasCoords) {
    return (
      <div className="bg-gray-100 rounded-lg h-40 flex items-center justify-center text-gray-400">
        Inga positionsdata för denna resa
      </div>
    );
  }
  return <TripMapInner {...props} />;
}
