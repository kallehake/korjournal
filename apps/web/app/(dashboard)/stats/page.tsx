'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { createBrowserClient } from '../../../lib/supabase/client';

type Tab = 'week' | 'month' | 'year';

interface AggRow {
  period: string;
  sortKey: string;
  totalKm: number;
  businessKm: number;
  privateKm: number;
  tripCount: number;
}

function tripDist(t: any): number {
  return t.distance_km ?? (t.odometer_end && t.odometer_start ? t.odometer_end - t.odometer_start : 0);
}

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return { year: d.getFullYear(), week };
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function aggregate(trips: any[], tab: Tab): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const trip of trips) {
    const date = new Date(trip.date);
    let period: string;
    let sortKey: string;

    if (tab === 'week') {
      const { year, week } = getISOWeek(date);
      sortKey = `${year}-${String(week).padStart(2, '0')}`;
      period = `v.${week} ${year}`;
    } else if (tab === 'month') {
      const m = date.getMonth();
      const y = date.getFullYear();
      sortKey = `${y}-${String(m + 1).padStart(2, '0')}`;
      period = `${MONTH_NAMES[m]} ${y}`;
    } else {
      sortKey = `${date.getFullYear()}`;
      period = sortKey;
    }

    const row = map.get(sortKey) ?? { period, sortKey, totalKm: 0, businessKm: 0, privateKm: 0, tripCount: 0 };
    const km = tripDist(trip);
    row.totalKm += km;
    if (trip.trip_type === 'business') row.businessKm += km;
    else row.privateKm += km;
    row.tripCount += 1;
    map.set(sortKey, row);
  }
  return [...map.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export default function StatsPage() {
  const [tab, setTab] = useState<Tab>('month');
  const supabase = createBrowserClient();

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['trips_stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('trips')
        .select('id, date, trip_type, distance_km, odometer_start, odometer_end')
        .eq('status', 'completed')
        .order('date', { ascending: false });
      return data ?? [];
    },
  });

  const rows = aggregate(trips, tab);
  const maxRows = tab === 'year' ? rows.length : 12;
  const chartData = rows.slice(0, maxRows).reverse().map(r => ({
    period: r.period,
    Tjänst: Math.round(r.businessKm),
    Privat: Math.round(r.privateKm),
  }));

  const totalKm = Math.round(trips.reduce((s, t) => s + tripDist(t), 0));
  const businessKm = Math.round(trips.filter(t => t.trip_type === 'business').reduce((s, t) => s + tripDist(t), 0));
  const privateKm = totalKm - businessKm;
  const avgKm = trips.length ? Math.round(totalKm / trips.length) : 0;

  const pieData = [
    { name: 'Tjänst', value: businessKm, color: '#2563eb' },
    { name: 'Privat', value: privateKm, color: '#f59e0b' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Statistik</h1>
        <p className="mt-1 text-sm text-gray-500">Körsträckor och fördelning per period</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Total distans</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalKm.toLocaleString('sv-SE')} km</p>
          <p className="text-xs text-gray-400 mt-1">{trips.length} resor totalt</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Tjänst</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{businessKm.toLocaleString('sv-SE')} km</p>
          <p className="text-xs text-gray-400 mt-1">{totalKm > 0 ? Math.round(businessKm / totalKm * 100) : 0}% av total distans</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Privat</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{privateKm.toLocaleString('sv-SE')} km</p>
          <p className="text-xs text-gray-400 mt-1">{totalKm > 0 ? Math.round(privateKm / totalKm * 100) : 0}% av total distans</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Snitt per resa</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{avgKm} km</p>
          <p className="text-xs text-gray-400 mt-1">{trips.length} resor</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stacked bar chart */}
        <div className="card lg:col-span-2">
          {/* Tabs */}
          <div className="flex gap-1 mb-5 border-b border-gray-200">
            {(['week', 'month', 'year'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'week' ? 'Vecka' : t === 'month' ? 'Månad' : 'År'}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-gray-400">Laddar...</div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Inga data</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} maxBarSize={tab === 'year' ? 60 : 24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit=" km" width={60} />
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v} km`, name]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="Tjänst" stackId="a" fill="#2563eb" />
                  <Bar dataKey="Privat" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pie chart — km-fördelning */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Fördelning km</h2>
          {totalKm === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Inga data</div>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString('sv-SE')} km`]} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                    <Legend formatter={(value) => <span className="text-sm text-gray-600">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-blue-600">Tjänst</span><span className="font-medium">{businessKm.toLocaleString('sv-SE')} km</span></div>
                <div className="flex justify-between"><span className="text-amber-500">Privat</span><span className="font-medium">{privateKm.toLocaleString('sv-SE')} km</span></div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {tab === 'week' ? 'Per vecka' : tab === 'month' ? 'Per månad' : 'Per år'}
        </h2>
        {isLoading ? (
          <div className="py-8 text-center text-gray-400">Laddar...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="table-header">
                  <th className="px-4 py-3 text-left">Period</th>
                  <th className="px-4 py-3 text-right">Totalt</th>
                  <th className="px-4 py-3 text-right">Tjänst</th>
                  <th className="px-4 py-3 text-right">Privat</th>
                  <th className="px-4 py-3 text-right">Resor</th>
                  <th className="px-4 py-3 text-right">Snitt/resa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => (
                  <tr key={r.sortKey} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.period}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{Math.round(r.totalKm).toLocaleString('sv-SE')} km</td>
                    <td className="px-4 py-3 text-sm text-right text-blue-600">{Math.round(r.businessKm).toLocaleString('sv-SE')} km</td>
                    <td className="px-4 py-3 text-sm text-right text-amber-600">{Math.round(r.privateKm).toLocaleString('sv-SE')} km</td>
                    <td className="px-4 py-3 text-sm text-right">{r.tripCount}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">
                      {r.tripCount > 0 ? Math.round(r.totalKm / r.tripCount) : 0} km
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
