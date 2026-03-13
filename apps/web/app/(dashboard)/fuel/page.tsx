'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { FuelLog } from '@korjournal/shared';
import { formatDate } from '@korjournal/shared';

export default function FuelPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    vehicle_id: '',
    kwh: '',
    cost_sek: '',
    station_name: '',
    odometer_km: '',
    notes: '',
  });

  const { data: chargeLogs, isLoading } = useQuery({
    queryKey: ['fuel_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_logs')
        .select(`*, vehicle:vehicles!vehicle_id(id, registration_number, make, model)`)
        .order('recorded_at', { ascending: false });
      if (error) throw error;
      return data as (FuelLog & { vehicle: { id: string; registration_number: string; make: string; model: string } })[];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, registration_number, make, model').eq('is_active', true);
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('id, organization_id').single();
      if (!profile) throw new Error('Profil saknas');
      const payload = {
        vehicle_id: form.vehicle_id,
        organization_id: profile.organization_id,
        recorded_by: profile.id,
        log_type: 'charge' as const,
        kwh: form.kwh ? parseFloat(form.kwh) : null,
        cost_sek: form.cost_sek ? parseFloat(form.cost_sek) : null,
        station_name: form.station_name || null,
        odometer_km: form.odometer_km ? parseInt(form.odometer_km) : null,
        notes: form.notes || null,
        recorded_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('fuel_logs').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_logs'] });
      setShowModal(false);
      setForm({ vehicle_id: '', kwh: '', cost_sek: '', station_name: '', odometer_km: '', notes: '' });
    },
  });

  const totalKwh = chargeLogs?.reduce((s, l) => s + (l.kwh ?? 0), 0) ?? 0;
  const totalCost = chargeLogs?.reduce((s, l) => s + (l.cost_sek ?? 0), 0) ?? 0;
  const costPerKwh = totalKwh > 0 ? (totalCost / totalKwh) : 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLogs = chargeLogs?.filter((l) => l.recorded_at >= monthStart) ?? [];
  const monthKwh = monthLogs.reduce((s, l) => s + (l.kwh ?? 0), 0);
  const monthCost = monthLogs.reduce((s, l) => s + (l.cost_sek ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Laddning</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Registrera laddning
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Total laddkostnad</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCost.toLocaleString('sv-SE')} kr</p>
          <p className="text-sm text-gray-400">{totalKwh.toFixed(1)} kWh totalt</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Snitt elpris</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{costPerKwh > 0 ? costPerKwh.toFixed(2) : '–'} kr/kWh</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Denna månad</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{monthKwh.toFixed(1)} kWh</p>
          <p className="text-sm text-gray-400">{monthCost.toLocaleString('sv-SE')} kr</p>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Registrera laddning</h2>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fordon</label>
                <select
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.vehicle_id}
                  onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
                >
                  <option value="">Välj fordon</option>
                  {vehicles?.map((v) => (
                    <option key={v.id} value={v.id}>{v.registration_number} – {v.make} {v.model}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">kWh</label>
                  <input
                    type="number" step="0.01"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.kwh}
                    onChange={(e) => setForm({ ...form, kwh: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kostnad (kr)</label>
                  <input
                    type="number" step="0.01"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.cost_sek}
                    onChange={(e) => setForm({ ...form, cost_sek: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Laddplats</label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="T.ex. Hemma, IONITY E20, Lidl Hindås"
                  value={form.station_name}
                  onChange={(e) => setForm({ ...form, station_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anteckningar</label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              {saveMutation.error && (
                <p className="text-sm text-red-600">{String(saveMutation.error)}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">
                  Avbryt
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {saveMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar laddningshistorik...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fordon</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">kWh</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kostnad</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">kr/kWh</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Laddplats</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {chargeLogs?.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{log.vehicle?.registration_number ?? '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(log.recorded_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{log.kwh != null ? `${log.kwh.toFixed(1)} kWh` : '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{log.cost_sek != null ? `${log.cost_sek.toLocaleString('sv-SE')} kr` : '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-right">
                    {log.kwh && log.cost_sek ? `${(log.cost_sek / log.kwh).toFixed(2)} kr` : '–'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{log.station_name ?? '–'}</td>
                </tr>
              ))}
              {chargeLogs?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Inga laddningar registrerade.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
