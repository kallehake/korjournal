'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { PrivateTripRule } from '@korjournal/shared';

const weekdays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

const emptyForm = {
  name: '',
  vehicle_id: '',
  driver_id: '',
  allowed_weekdays: [0, 1, 2, 3, 4] as number[],
  allowed_start_time: '17:00',
  allowed_end_time: '07:00',
  max_private_km_per_month: '',
  max_private_trips_per_month: '',
  max_private_percentage: '',
  is_active: true,
};

export default function RulesPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['private_trip_rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('private_trip_rules')
        .select(`
          *,
          vehicle:vehicles!vehicle_id(id, registration_number),
          driver:profiles!driver_id(id, full_name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (PrivateTripRule & {
        vehicle: { id: string; registration_number: string } | null;
        driver: { id: string; full_name: string } | null;
      })[];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, registration_number').eq('is_active', true);
      return data ?? [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name');
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        vehicle_id: form.vehicle_id || null,
        driver_id: form.driver_id || null,
        allowed_weekdays: form.allowed_weekdays,
        allowed_start_time: form.allowed_start_time,
        allowed_end_time: form.allowed_end_time,
        max_private_km_per_month: form.max_private_km_per_month ? parseFloat(form.max_private_km_per_month) : null,
        max_private_trips_per_month: form.max_private_trips_per_month ? parseInt(form.max_private_trips_per_month) : null,
        max_private_percentage: form.max_private_percentage ? parseFloat(form.max_private_percentage) : null,
        is_active: form.is_active,
      };
      if (editingId) {
        const { error } = await supabase.from('private_trip_rules').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('private_trip_rules').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['private_trip_rules'] });
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('private_trip_rules').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['private_trip_rules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('private_trip_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['private_trip_rules'] }),
  });

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(r: PrivateTripRule) {
    setForm({
      name: r.name,
      vehicle_id: r.vehicle_id ?? '',
      driver_id: r.driver_id ?? '',
      allowed_weekdays: r.allowed_weekdays,
      allowed_start_time: r.allowed_start_time,
      allowed_end_time: r.allowed_end_time,
      max_private_km_per_month: r.max_private_km_per_month != null ? String(r.max_private_km_per_month) : '',
      max_private_trips_per_month: r.max_private_trips_per_month != null ? String(r.max_private_trips_per_month) : '',
      max_private_percentage: r.max_private_percentage != null ? String(r.max_private_percentage) : '',
      is_active: r.is_active,
    });
    setEditingId(r.id);
    setShowForm(true);
  }

  function toggleWeekday(day: number) {
    setForm((f) => ({
      ...f,
      allowed_weekdays: f.allowed_weekdays.includes(day)
        ? f.allowed_weekdays.filter((d) => d !== day)
        : [...f.allowed_weekdays, day].sort(),
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Regler för privatkörning</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Ny regel
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Redigera regel' : 'Ny regel'}
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Regelnamn</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="T.ex. Standard privatkörning"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fordon (valfritt)</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.vehicle_id}
                    onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                  >
                    <option value="">Alla fordon</option>
                    {vehicles?.map((v) => (
                      <option key={v.id} value={v.id}>{v.registration_number}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Förare (valfritt)</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.driver_id}
                    onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                  >
                    <option value="">Alla förare</option>
                    {drivers?.map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tillåtna veckodagar</label>
                <div className="flex gap-2">
                  {weekdays.map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        form.allowed_weekdays.includes(i)
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Starttid</label>
                  <input
                    type="time"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.allowed_start_time}
                    onChange={(e) => setForm({ ...form, allowed_start_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sluttid</label>
                  <input
                    type="time"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.allowed_end_time}
                    onChange={(e) => setForm({ ...form, allowed_end_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max km/månad</label>
                  <input
                    type="number"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.max_private_km_per_month}
                    onChange={(e) => setForm({ ...form, max_private_km_per_month: e.target.value })}
                    placeholder="Obegränsat"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max resor/månad</label>
                  <input
                    type="number"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.max_private_trips_per_month}
                    onChange={(e) => setForm({ ...form, max_private_trips_per_month: e.target.value })}
                    placeholder="Obegränsat"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.max_private_percentage}
                    onChange={(e) => setForm({ ...form, max_private_percentage: e.target.value })}
                    placeholder="Obegränsat"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rule-active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="rule-active" className="text-sm text-gray-700">Aktiv</label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">
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

      {/* Rules list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar regler...</div>
      ) : (
        <div className="space-y-4">
          {rules?.map((r) => (
            <div key={r.id} className={`bg-white rounded-lg shadow-sm border p-5 ${!r.is_active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{r.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    {r.vehicle && <span>Fordon: {r.vehicle.registration_number}</span>}
                    {r.driver && <span>Förare: {r.driver.full_name}</span>}
                    {!r.vehicle && !r.driver && <span>Alla fordon och förare</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleMutation.mutate({ id: r.id, is_active: !r.is_active })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${r.is_active ? 'bg-primary-600' : 'bg-gray-200'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${r.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-400 text-xs">Veckodagar</span>
                  <div className="flex gap-1 mt-1">
                    {weekdays.map((day, i) => (
                      <span
                        key={i}
                        className={`w-7 h-7 flex items-center justify-center rounded text-xs font-medium ${
                          r.allowed_weekdays.includes(i)
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {day[0]}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Tidsperiod</span>
                  <p className="text-gray-700 mt-1">{r.allowed_start_time} - {r.allowed_end_time}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-xs">Begränsningar</span>
                  <div className="text-gray-700 mt-1 space-y-0.5">
                    {r.max_private_km_per_month != null && <p>{r.max_private_km_per_month} km/mån</p>}
                    {r.max_private_trips_per_month != null && <p>{r.max_private_trips_per_month} resor/mån</p>}
                    {r.max_private_percentage != null && <p>{r.max_private_percentage}% max</p>}
                    {r.max_private_km_per_month == null && r.max_private_trips_per_month == null && r.max_private_percentage == null && (
                      <p className="text-gray-400">Inga begränsningar</p>
                    )}
                  </div>
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    onClick={() => startEdit(r)}
                    className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                  >
                    Redigera
                  </button>
                  <button
                    onClick={() => { if (confirm('Ta bort denna regel?')) deleteMutation.mutate(r.id); }}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Ta bort
                  </button>
                </div>
              </div>
            </div>
          ))}
          {rules?.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
              Inga regler skapade. Klicka &quot;Ny regel&quot; för att börja.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
