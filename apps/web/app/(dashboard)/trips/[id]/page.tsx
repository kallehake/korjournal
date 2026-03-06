'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '../../../lib/supabase/client';
import { formatDate, formatTime, formatDistance, tripTypeLabel, tripStatusLabel } from '@korjournal/shared';

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createBrowserClient();

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select(`
          *,
          driver:profiles!driver_id(id, full_name, email),
          vehicle:vehicles!vehicle_id(id, registration_number, make, model),
          customer:customers!customer_id(id, name)
        `)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: gpsPoints } = useQuery({
    queryKey: ['gps_points', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('gps_points')
        .select('latitude, longitude, timestamp')
        .eq('trip_id', id)
        .order('timestamp', { ascending: true });
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Laddar resa...</div>;
  }

  if (!trip) {
    return <div className="text-center py-12 text-gray-500">Resa hittades inte</div>;
  }

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="py-3 border-b border-gray-100 flex justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || '-'}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Tillbaka
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Resdetaljer</h1>
        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${
          trip.trip_type === 'business'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-purple-100 text-purple-700'
        }`}>
          {tripTypeLabel(trip.trip_type)}
        </span>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          trip.status === 'completed'
            ? 'bg-green-100 text-green-700'
            : trip.status === 'active'
            ? 'bg-yellow-100 text-yellow-700'
            : 'bg-gray-100 text-gray-700'
        }`}>
          {tripStatusLabel(trip.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trip Info */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Reseinformation</h2>
          <InfoRow label="Datum" value={formatDate(trip.date)} />
          <InfoRow label="Starttid" value={formatTime(trip.start_time)} />
          <InfoRow label="Sluttid" value={trip.end_time ? formatTime(trip.end_time) : null} />
          <InfoRow label="Startadress" value={trip.start_address} />
          <InfoRow label="Slutadress" value={trip.end_address} />
          <InfoRow label="Ändamål" value={trip.purpose} />
          <InfoRow label="Besökt person" value={trip.visited_person} />
          <InfoRow label="Anteckningar" value={trip.notes} />
        </div>

        {/* Vehicle & Driver */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Fordon & Förare</h2>
          <InfoRow label="Fordon" value={
            trip.vehicle
              ? `${(trip.vehicle as any).registration_number} ${(trip.vehicle as any).make ?? ''} ${(trip.vehicle as any).model ?? ''}`.trim()
              : null
          } />
          <InfoRow label="Förare" value={(trip.driver as any)?.full_name} />
          <InfoRow label="Kund" value={(trip.customer as any)?.name} />

          <h2 className="text-lg font-semibold mt-6 mb-4">Körsträcka</h2>
          <InfoRow label="Mätarställning start" value={trip.odometer_start ? `${trip.odometer_start.toLocaleString()} km` : null} />
          <InfoRow label="Mätarställning slut" value={trip.odometer_end ? `${trip.odometer_end.toLocaleString()} km` : null} />
          <InfoRow label="Körd sträcka" value={formatDistance(trip.distance_km)} />
          <InfoRow label="GPS-sträcka" value={formatDistance(trip.distance_gps_km)} />
          {trip.distance_deviation_pct != null && trip.distance_deviation_pct > 5 && (
            <div className="mt-2 p-3 bg-yellow-50 rounded-md text-yellow-700 text-sm">
              Avvikelse mellan mätare och GPS: {trip.distance_deviation_pct.toFixed(1)}%
            </div>
          )}
        </div>

        {/* Map placeholder */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Karta</h2>
          {gpsPoints && gpsPoints.length > 0 ? (
            <div className="bg-gray-100 rounded-lg h-80 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg font-medium">Kartvy</p>
                <p className="text-sm">{gpsPoints.length} GPS-punkter registrerade</p>
                <p className="text-xs mt-1">
                  {gpsPoints[0].latitude.toFixed(4)}, {gpsPoints[0].longitude.toFixed(4)}
                  {' → '}
                  {gpsPoints[gpsPoints.length - 1].latitude.toFixed(4)}, {gpsPoints[gpsPoints.length - 1].longitude.toFixed(4)}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-100 rounded-lg h-40 flex items-center justify-center text-gray-400">
              Inga GPS-punkter för denna resa
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
