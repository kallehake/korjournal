'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { Geofence, GeofenceType } from '@korjournal/shared';
import { geofenceTypeLabels } from '@korjournal/shared';

const MAP_CENTER: [number, number] = [59.3293, 18.0686];

const typeColors: Record<GeofenceType, string> = {
  home: '#2563eb',
  office: '#7c3aed',
  customer: '#16a34a',
  other: '#6b7280',
};

interface PinLocation {
  lat: number;
  lng: number;
  address: string;
}

// Dynamically import the map component to avoid SSR issues with Leaflet
const GeofenceMap = dynamic(() => import('./GeofenceMap'), { ssr: false, loading: () => (
  <div className="h-full flex items-center justify-center bg-gray-100 text-gray-400">Laddar karta...</div>
)});

export default function GeofencesPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();

  const [pin, setPin] = useState<PinLocation | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'office' as GeofenceType,
    radius_meters: 200,
    auto_trip_type: '',
    is_active: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  const { data: geofences, isLoading } = useQuery({
    queryKey: ['geofences'],
    queryFn: async () => {
      const { data, error } = await supabase.from('geofences').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Geofence[];
    },
  });

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=sv`,
        { headers: { 'User-Agent': 'Korjournal/1.0' } }
      );
      const data = await res.json();
      return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    const address = await reverseGeocode(lat, lng);
    setPin({ lat, lng, address });
    setShowForm(true);
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&countrycodes=se&format=json&limit=1&accept-language=sv`,
        { headers: { 'User-Agent': 'Korjournal/1.0' } }
      );
      const results = await res.json();
      if (results[0]) {
        const lat = parseFloat(results[0].lat);
        const lng = parseFloat(results[0].lon);
        const address = results[0].display_name;
        setPin({ lat, lng, address });
        setFlyTo([lat, lng]);
        setShowForm(true);
      }
    } finally {
      setSearching(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!pin) return;
      const { data: profile } = await supabase.from('profiles').select('organization_id').single();
      const payload = {
        name: form.name || pin.address,
        type: form.type,
        latitude: pin.lat,
        longitude: pin.lng,
        radius_meters: form.radius_meters,
        auto_trip_type: form.auto_trip_type || null,
        is_active: form.is_active,
        organization_id: profile!.organization_id,
      };
      if (editingId) {
        const { error } = await supabase.from('geofences').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('geofences').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofences'] });
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('geofences').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['geofences'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('geofences').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['geofences'] }),
  });

  function resetForm() {
    setPin(null);
    setEditingId(null);
    setShowForm(false);
    setForm({ name: '', type: 'office', radius_meters: 200, auto_trip_type: '', is_active: true });
  }

  function startEdit(g: Geofence) {
    setPin({ lat: g.latitude, lng: g.longitude, address: `${g.latitude.toFixed(5)}, ${g.longitude.toFixed(5)}` });
    setFlyTo([g.latitude, g.longitude]);
    setEditingId(g.id);
    setForm({
      name: g.name,
      type: g.type,
      radius_meters: g.radius_meters,
      auto_trip_type: g.auto_trip_type ?? '',
      is_active: g.is_active,
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Geofences</h1>
          <p className="text-sm text-gray-500 mt-0.5">Klicka på kartan eller sök en adress för att lägga till en zon</p>
        </div>
      </div>

      {/* Map */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Search bar */}
        <div className="p-3 border-b">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sök adress eller plats..."
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {searching ? '...' : 'Sök'}
            </button>
          </form>
        </div>

        {/* Map canvas */}
        <div className="h-[480px]">
          <GeofenceMap
            center={MAP_CENTER}
            flyTo={flyTo}
            pin={pin}
            geofences={geofences ?? []}
            formRadius={form.radius_meters}
            formType={form.type}
            typeColors={typeColors}
            onMapClick={handleMapClick}
            onGeofenceClick={startEdit}
          />
        </div>
      </div>

      {/* Form panel */}
      {showForm && pin && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">{editingId ? 'Redigera zon' : 'Ny zon'}</h2>
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                {pin.address}
              </p>
            </div>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Namn</label>
              <input
                className="input"
                placeholder={pin.address}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Typ</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GeofenceType })}>
                {(Object.entries(geofenceTypeLabels) as [GeofenceType, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Radie: {form.radius_meters} meter</label>
              <input
                type="range"
                min={50} max={2000} step={50}
                value={form.radius_meters}
                onChange={(e) => setForm({ ...form, radius_meters: parseInt(e.target.value) })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>50 m</span><span>2 km</span>
              </div>
            </div>
            <div>
              <label className="label">Auto-klassificera resa</label>
              <select className="input" value={form.auto_trip_type} onChange={(e) => setForm({ ...form, auto_trip_type: e.target.value })}>
                <option value="">Ingen auto-klassificering</option>
                <option value="business">Tjänsteresa</option>
                <option value="private">Privatresa</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
              Aktiv
            </label>
            <div className="ml-auto flex gap-3">
              <button onClick={resetForm} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Avbryt</button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="btn-primary px-6"
              >
                {saveMutation.isPending ? 'Sparar...' : 'Spara zon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Geofence list */}
      {!isLoading && geofences && geofences.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Aktiva zoner</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {geofences.map((g) => (
              <div key={g.id} className={`bg-white rounded-lg shadow-sm border p-4 ${!g.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: typeColors[g.type] }} />
                    <p className="font-medium text-gray-900 text-sm">{g.name}</p>
                  </div>
                  <button
                    onClick={() => toggleMutation.mutate({ id: g.id, is_active: !g.is_active })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${g.is_active ? 'bg-primary-600' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${g.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="mt-2 space-y-0.5">
                  <p className="text-xs text-gray-500">{g.radius_meters} m radie</p>
                  {g.auto_trip_type && (
                    <p className="text-xs text-blue-600">Auto: {g.auto_trip_type === 'business' ? 'Tjänsteresa' : 'Privatresa'}</p>
                  )}
                </div>
                <div className="flex gap-3 mt-3 pt-2 border-t border-gray-100">
                  <button onClick={() => startEdit(g)} className="text-xs text-primary-600 hover:text-primary-800 font-medium">Redigera</button>
                  <button onClick={() => { if (confirm('Ta bort?')) deleteMutation.mutate(g.id); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Ta bort</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
