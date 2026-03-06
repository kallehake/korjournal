'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { Geofence, GeofenceType } from '@korjournal/shared';
import { geofenceTypeLabels } from '@korjournal/shared';

const typeColors: Record<GeofenceType, string> = {
  home: 'bg-blue-100 text-blue-800',
  office: 'bg-purple-100 text-purple-800',
  customer: 'bg-green-100 text-green-800',
  other: 'bg-gray-100 text-gray-800',
};

const emptyForm = {
  name: '',
  type: 'office' as GeofenceType,
  latitude: 59.3293,
  longitude: 18.0686,
  radius_meters: 200,
  auto_trip_type: '' as string,
  is_active: true,
};

export default function GeofencesPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['geofences'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geofences')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Geofence[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const payload = {
        name: values.name,
        type: values.type,
        latitude: values.latitude,
        longitude: values.longitude,
        radius_meters: values.radius_meters,
        auto_trip_type: values.auto_trip_type || null,
        is_active: values.is_active,
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
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(g: Geofence) {
    setForm({
      name: g.name,
      type: g.type,
      latitude: g.latitude,
      longitude: g.longitude,
      radius_meters: g.radius_meters,
      auto_trip_type: g.auto_trip_type ?? '',
      is_active: g.is_active,
    });
    setEditingId(g.id);
    setShowForm(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Geofences</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Lägg till geofence
        </button>
      </div>

      {/* Placeholder map area */}
      <div className="bg-white rounded-lg shadow-sm border mb-6 p-6">
        <div className="h-64 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <svg className="mx-auto h-12 w-12 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
            </svg>
            <p className="text-sm font-medium">Kartvy</p>
            <p className="text-xs">Geofences visas här när kartintegration är aktiverad</p>
          </div>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Redigera geofence' : 'Ny geofence'}
            </h2>
            <form
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as GeofenceType })}
                >
                  {(Object.entries(geofenceTypeLabels) as [GeofenceType, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitud</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitud</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Radie (meter)</label>
                <input
                  type="number"
                  required
                  min={10}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.radius_meters}
                  onChange={(e) => setForm({ ...form, radius_meters: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Automatisk restyp</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.auto_trip_type}
                  onChange={(e) => setForm({ ...form, auto_trip_type: e.target.value })}
                >
                  <option value="">Ingen</option>
                  <option value="business">Tjänsteresa</option>
                  <option value="private">Privatresa</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="geofence-active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="geofence-active" className="text-sm text-gray-700">Aktiv</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Geofence cards */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar geofences...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((g) => (
            <div key={g.id} className={`bg-white rounded-lg shadow-sm border p-5 ${!g.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{g.name}</h3>
                  <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${typeColors[g.type]}`}>
                    {geofenceTypeLabels[g.type]}
                  </span>
                </div>
                <button
                  onClick={() => toggleMutation.mutate({ id: g.id, is_active: !g.is_active })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${g.is_active ? 'bg-primary-600' : 'bg-gray-200'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${g.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Lat: {g.latitude.toFixed(5)}, Lng: {g.longitude.toFixed(5)}</p>
                <p>Radie: {g.radius_meters} m</p>
                {g.auto_trip_type && <p>Auto: {g.auto_trip_type === 'business' ? 'Tjänsteresa' : 'Privatresa'}</p>}
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => startEdit(g)}
                  className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                >
                  Redigera
                </button>
                <button
                  onClick={() => { if (confirm('Ta bort denna geofence?')) deleteMutation.mutate(g.id); }}
                  className="text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  Ta bort
                </button>
              </div>
            </div>
          ))}
          {data?.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              Inga geofences skapade. Klicka &quot;Lägg till geofence&quot; för att börja.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
