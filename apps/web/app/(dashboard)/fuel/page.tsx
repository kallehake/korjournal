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
    log_type: 'refuel' as 'refuel' | 'charge',
    liters: '',
    kwh: '',
    cost_sek: '',
    station_name: '',
    odometer_km: '',
    is_full_tank: false,
    notes: '',
  });

  const { data: fuelLogs, isLoading } = useQuery({
    queryKey: ['fuel_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_logs')
        .select(`
          *,
          vehicle:vehicles!vehicle_id(id, registration_number, make, model)
        `)
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
      const payload = {
        vehicle_id: form.vehicle_id,
        log_type: form.log_type,
        liters: form.liters ? parseFloat(form.liters) : null,
        kwh: form.kwh ? parseFloat(form.kwh) : null,
        cost_sek: form.cost_sek ? parseFloat(form.cost_sek) : null,
        station_name: form.station_name || null,
        odometer_km: form.odometer_km ? parseInt(form.odometer_km) : null,
        is_full_tank: form.is_full_tank,
        notes: form.notes || null,
        recorded_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('fuel_logs').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_logs'] });
      setShowModal(false);
      setForm({
        vehicle_id: '',
        log_type: 'refuel',
        liters: '',
        kwh: '',
        cost_sek: '',
        station_name: '',
        odometer_km: '',
        is_full_tank: false,
        notes: '',
      });
    },
  });

  // Monthly summary
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthLogs = fuelLogs?.filter((l) => l.recorded_at >= monthStart) ?? [];
  const totalCostMonth = monthLogs.reduce((sum, l) => sum + (l.cost_sek ?? 0), 0);
  const totalLitersMonth = monthLogs.reduce((sum, l) => sum + (l.liters ?? 0), 0);
  const totalCostAll = fuelLogs?.reduce((sum, l) => sum + (l.cost_sek ?? 0), 0) ?? 0;
  const avgConsumption = fuelLogs && fuelLogs.length > 0
    ? (fuelLogs.reduce((sum, l) => sum + (l.liters ?? 0), 0) / fuelLogs.length).toFixed(1)
    : '0';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bränsle</h1>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Lägg till tankning
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Total bränslekostnad</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalCostAll.toLocaleString('sv-SE')} kr</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Snittförbrukning per tankning</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{avgConsumption} liter</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Denna månad</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalLitersMonth.toFixed(1)} liter</p>
          <p className="text-sm text-gray-400">{totalCostMonth.toLocaleString('sv-SE')} kr</p>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ny tankning / laddning</h2>
            <form
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
              className="space-y-4"
            >
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
                    <option key={v.id} value={v.id}>{v.registration_number} - {v.make} {v.model}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.log_type}
                  onChange={(e) => setForm({ ...form, log_type: e.target.value as 'refuel' | 'charge' })}
                >
                  <option value="refuel">Tankning</option>
                  <option value="charge">Laddning</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {form.log_type === 'refuel' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Liter</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      value={form.liters}
                      onChange={(e) => setForm({ ...form, liters: e.target.value })}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">kWh</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded-md px-3 py-2 text-sm"
                      value={form.kwh}
                      onChange={(e) => setForm({ ...form, kwh: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kostnad (kr)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.cost_sek}
                    onChange={(e) => setForm({ ...form, cost_sek: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Station</label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="T.ex. Circle K Solna"
                  value={form.station_name}
                  onChange={(e) => setForm({ ...form, station_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mätarställning (km)</label>
                <input
                  type="number"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.odometer_km}
                  onChange={(e) => setForm({ ...form, odometer_km: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="full-tank"
                  checked={form.is_full_tank}
                  onChange={(e) => setForm({ ...form, is_full_tank: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="full-tank" className="text-sm text-gray-700">Fulltankad</label>
              </div>
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

      {/* Fuel log table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar bränsleloggar...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fordon</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Liter/kWh</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kostnad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Station</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {fuelLogs?.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {log.vehicle?.registration_number ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(log.recorded_at)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {log.log_type === 'refuel' ? 'Tankning' : 'Laddning'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {log.log_type === 'refuel'
                      ? `${log.liters?.toFixed(1) ?? '-'} l`
                      : `${log.kwh?.toFixed(1) ?? '-'} kWh`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {log.cost_sek != null ? `${log.cost_sek.toLocaleString('sv-SE')} kr` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{log.station_name ?? '-'}</td>
                </tr>
              ))}
              {fuelLogs?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Inga bränsleloggar registrerade.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
