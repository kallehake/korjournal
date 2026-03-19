'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '../../../../lib/supabase/client';
import { formatDate, formatTime, formatDistance, tripTypeLabel, tripStatusLabel } from '@korjournal/shared';
import TripMap from '../../../../components/TripMap';

function useGeocode(lat?: number | null, lng?: number | null) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!lat || !lng) return;
    fetch(`/api/geocode?lat=${lat}&lng=${lng}`)
      .then(r => r.json())
      .then(d => { if (d.label) setLabel(d.label); })
      .catch(() => {});
  }, [lat, lng]);
  return label;
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    trip_type: 'business',
    purpose: '',
    visited_person: '',
    notes: '',
    customer_id: '',
  });

  // Reset state when navigating between trips
  useEffect(() => {
    setEditing(false);
    setForm({ trip_type: 'business', purpose: '', visited_person: '', notes: '', customer_id: '' });
  }, [id]);

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

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name').order('name');
      return data ?? [];
    },
  });

  // Adjacent trips for prev/next navigation
  const { data: navData } = useQuery({
    queryKey: ['trip_nav', id, trip?.start_time],
    enabled: !!trip?.start_time,
    queryFn: async () => {
      const [{ data: newerData }, { data: olderData }] = await Promise.all([
        // Newer trip = previous in the descending list
        supabase.from('trips').select('id')
          .gt('start_time', trip!.start_time)
          .order('start_time', { ascending: true })
          .limit(1),
        // Older trip = next in the descending list
        supabase.from('trips').select('id')
          .lt('start_time', trip!.start_time)
          .order('start_time', { ascending: false })
          .limit(1),
      ]);
      return {
        prevId: newerData?.[0]?.id ?? null,
        nextId: olderData?.[0]?.id ?? null,
      };
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

  const startLabel = useGeocode(trip?.start_lat, trip?.start_lng);
  const endLabel = useGeocode(trip?.end_lat, trip?.end_lng);

  function startEdit() {
    if (!trip) return;
    setForm({
      trip_type: trip.trip_type ?? 'business',
      purpose: trip.purpose ?? '',
      visited_person: trip.visited_person ?? '',
      notes: trip.notes ?? '',
      customer_id: (trip.customer as any)?.id ?? '',
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('trips')
      .update({
        trip_type: form.trip_type,
        purpose: form.purpose || null,
        visited_person: form.visited_person || null,
        notes: form.notes || null,
        customer_id: form.customer_id || null,
      })
      .eq('id', id as string);

    setSaving(false);
    if (!error) {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['trip', id] });
      return true;
    }
    return false;
  }

  async function navigateTo(targetId: string) {
    if (editing) {
      const ok = await save();
      if (!ok) return;
    }
    router.push(`/trips/${targetId}`);
  }

  const [creatingReturn, setCreatingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  async function createReturnTrip() {
    if (!trip) return;
    setCreatingReturn(true);
    setReturnError(null);
    const { data: profile } = await supabase.from('profiles').select('id, organization_id').single();
    if (!profile) { setCreatingReturn(false); setReturnError('Kunde inte hämta profil'); return; }

    // start_time är NOT NULL — använd end_time om den finns, annars datum + 00:00
    const startTime = trip.end_time ?? `${trip.date}T00:00:00`;

    const { data: newTrip, error } = await supabase
      .from('trips')
      .insert({
        organization_id: profile.organization_id,
        driver_id: (trip.driver as any)?.id ?? profile.id,
        vehicle_id: (trip.vehicle as any)?.id ?? null,
        date: trip.date,
        start_time: startTime,
        end_time: null,
        start_address: trip.end_address ?? trip.start_address,
        end_address: trip.start_address,
        start_lat: trip.end_lat ?? null,
        start_lng: trip.end_lng ?? null,
        end_lat: trip.start_lat ?? null,
        end_lng: trip.start_lng ?? null,
        odometer_start: null,
        odometer_end: null,
        trip_type: trip.trip_type,
        purpose: trip.purpose ?? null,
        visited_person: trip.visited_person ?? null,
        customer_id: (trip.customer as any)?.id ?? null,
        notes: trip.notes ?? null,
        status: 'completed',
      })
      .select('id')
      .single();

    setCreatingReturn(false);
    if (error) {
      setReturnError(error.message);
    } else if (newTrip) {
      router.push(`/trips/${newTrip.id}`);
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Laddar resa...</div>;
  }

  if (!trip) {
    return <div className="text-center py-12 text-gray-500">Resa hittades inte</div>;
  }

  const missingPurpose = trip.trip_type === 'business' && !trip.purpose;

  function formatAddress(coords: string | null | undefined, geocoded: string | null) {
    if (!coords) return '-';
    if (geocoded) return `${geocoded} (${coords})`;
    return coords;
  }

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
    <div className="py-3 border-b border-gray-100 flex justify-between gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value || '-'}</span>
    </div>
  );

  return (
    <div>
      {/* Skatteverket-varning */}
      {missingPurpose && !editing && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span><strong>Ändamål saknas.</strong> Skatteverket kräver syfte för varje tjänsteresa. Fyll i ändamålet via Redigera resa.</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => router.back()} className="text-sm text-blue-600 hover:text-blue-800">
            &larr; Tillbaka till resor
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navData?.prevId && navigateTo(navData.prevId)}
              disabled={!navData?.prevId || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Föregående resa (nyare)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Föregående
            </button>
            <button
              onClick={() => navData?.nextId && navigateTo(navData.nextId)}
              disabled={!navData?.nextId || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Nästa resa (äldre)"
            >
              Nästa
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
        {returnError && (
          <div className="mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{returnError}</div>
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">Resdetaljer</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              (editing ? form.trip_type : trip.trip_type) === 'business'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-purple-100 text-purple-700'
            }`}>
              {tripTypeLabel(editing ? form.trip_type : trip.trip_type)}
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
          <div className="flex gap-2 shrink-0">
            {!editing ? (
              <>
                <button
                  onClick={createReturnTrip}
                  disabled={creatingReturn}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 border"
                  title="Skapa en ny resa med start och mål ombytta"
                >
                  {creatingReturn ? 'Skapar...' : '⇄ Returresa'}
                </button>
                <button
                  onClick={startEdit}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow"
                >
                  ✏️ Redigera resa
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                >
                  Avbryt
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 shadow"
                >
                  {saving ? 'Sparar...' : '✓ Spara ändringar'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trip Info */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Reseinformation</h2>
          <InfoRow label="Datum" value={formatDate(trip.date)} />
          <InfoRow label="Starttid" value={formatTime(trip.start_time)} />
          <InfoRow label="Sluttid" value={trip.end_time ? formatTime(trip.end_time) : null} />
          <InfoRow label="Startadress" value={formatAddress(trip.start_address, startLabel)} />
          <InfoRow label="Slutadress" value={formatAddress(trip.end_address, endLabel)} />

          {editing ? (
            <>
              <div className="py-3 border-b border-gray-100">
                <label className="block text-sm text-gray-500 mb-1">Restyp</label>
                <select
                  value={form.trip_type}
                  onChange={e => setForm(f => ({ ...f, trip_type: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="business">Tjänsteresa</option>
                  <option value="private">Privatresa</option>
                </select>
              </div>
              <div className="py-3 border-b border-gray-100">
                <label className="block text-sm text-gray-500 mb-1">Ändamål</label>
                <input
                  type="text"
                  value={form.purpose}
                  onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                  placeholder="T.ex. kundbesök, möte..."
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="py-3 border-b border-gray-100">
                <label className="block text-sm text-gray-500 mb-1">Besökt person</label>
                <input
                  type="text"
                  value={form.visited_person}
                  onChange={e => setForm(f => ({ ...f, visited_person: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="py-3">
                <label className="block text-sm text-gray-500 mb-1">Anteckningar</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <>
              <InfoRow label="Ändamål" value={trip.purpose} />
              <InfoRow label="Besökt person" value={trip.visited_person} />
              <InfoRow label="Anteckningar" value={trip.notes} />
            </>
          )}
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

          {editing ? (
            <div className="py-3 border-b border-gray-100">
              <label className="block text-sm text-gray-500 mb-1">Kund</label>
              <select
                value={form.customer_id}
                onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Ingen kund</option>
                {customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <InfoRow label="Kund" value={(trip.customer as any)?.name} />
          )}

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

        {/* Map */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Karta</h2>
          <TripMap
            startLat={trip.start_lat}
            startLng={trip.start_lng}
            endLat={trip.end_lat}
            endLng={trip.end_lng}
            gpsPoints={gpsPoints ?? []}
          />
          {gpsPoints && gpsPoints.length > 0 && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              {gpsPoints.length} GPS-punkter registrerade
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
