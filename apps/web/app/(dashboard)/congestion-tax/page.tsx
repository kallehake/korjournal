'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { CongestionTaxPassage } from '@korjournal/shared';
import { formatDate, formatTime } from '@korjournal/shared';

export default function CongestionTaxPage() {
  const supabase = createBrowserClient();
  const now = new Date();
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: passages, isLoading } = useQuery({
    queryKey: ['congestion_tax_passages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('congestion_tax_passages')
        .select(`
          *,
          vehicle:vehicles!vehicle_id(id, registration_number, make, model)
        `)
        .order('passage_time', { ascending: false });
      if (error) throw error;
      return data as (CongestionTaxPassage & {
        vehicle: { id: string; registration_number: string; make: string; model: string };
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

  const filteredPassages = useMemo(() => {
    if (!passages) return [];
    return passages.filter((p) => {
      if (vehicleFilter && p.vehicle_id !== vehicleFilter) return false;
      if (dateFrom && p.passage_time < dateFrom) return false;
      if (dateTo && p.passage_time > dateTo + 'T23:59:59') return false;
      return true;
    });
  }, [passages, vehicleFilter, dateFrom, dateTo]);

  // Summaries
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  const thisMonthTotal = passages
    ?.filter((p) => p.passage_time >= monthStart)
    .reduce((sum, p) => sum + p.amount_sek, 0) ?? 0;

  const thisYearTotal = passages
    ?.filter((p) => p.passage_time >= yearStart)
    .reduce((sum, p) => sum + p.amount_sek, 0) ?? 0;

  const filteredTotal = filteredPassages.reduce((sum, p) => sum + p.amount_sek, 0);

  // Monthly chart data (last 12 months)
  const monthlyData = useMemo(() => {
    if (!passages) return [];
    const months: { label: string; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.toISOString();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
      const total = passages
        .filter((p) => p.passage_time >= start && p.passage_time <= end)
        .reduce((sum, p) => sum + p.amount_sek, 0);
      months.push({
        label: d.toLocaleDateString('sv-SE', { month: 'short' }),
        total,
      });
    }
    return months;
  }, [passages, now.getFullYear(), now.getMonth()]);

  const maxMonthly = Math.max(...monthlyData.map((m) => m.total), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trängselskatt</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Denna månad</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{thisMonthTotal.toLocaleString('sv-SE')} kr</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Detta år</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{thisYearTotal.toLocaleString('sv-SE')} kr</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-5">
          <p className="text-sm text-gray-500">Filtrerat resultat</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{filteredTotal.toLocaleString('sv-SE')} kr</p>
          <p className="text-xs text-gray-400">{filteredPassages.length} passager</p>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-4">Trängselskattetrend (12 månader)</h2>
        <div className="flex items-end gap-2 h-40">
          {monthlyData.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-gray-500">{m.total > 0 ? `${m.total}` : ''}</span>
              <div
                className="w-full bg-primary-500 rounded-t transition-all min-h-[2px]"
                style={{ height: `${(m.total / maxMonthly) * 120}px` }}
              />
              <span className="text-xs text-gray-400">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fordon</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
            >
              <option value="">Alla fordon</option>
              {vehicles?.map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Från datum</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Till datum</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Passages table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar trängselskattpassager...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Station</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fordon</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tidpunkt</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Högtrafik</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Belopp</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Resa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPassages.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.station_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.city}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.vehicle?.registration_number ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {formatDate(p.passage_time)} {formatTime(p.passage_time)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.is_high_traffic ? (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Ja
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Nej</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">
                    {p.amount_sek.toLocaleString('sv-SE')} kr
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.trip_id ? (
                      <a
                        href={`/trips/${p.trip_id}`}
                        className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                      >
                        Visa
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredPassages.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Inga trängselskattpassager hittades.
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
