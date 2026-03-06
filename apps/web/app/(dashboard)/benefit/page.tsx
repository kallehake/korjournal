'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { BenefitReport } from '@korjournal/shared';
import { formatDistance } from '@korjournal/shared';

export default function BenefitPage() {
  const supabase = createBrowserClient();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const { data: reports, isLoading } = useQuery({
    queryKey: ['benefit_reports', selectedYear, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('benefit_reports')
        .select(`
          *,
          driver:profiles!driver_id(id, full_name),
          vehicle:vehicles!vehicle_id(id, registration_number, make, model)
        `)
        .eq('period_year', selectedYear)
        .eq('period_month', selectedMonth)
        .order('private_percentage', { ascending: false });
      if (error) throw error;
      return data as (BenefitReport & {
        driver: { id: string; full_name: string };
        vehicle: { id: string; registration_number: string; make: string; model: string };
      })[];
    },
  });

  const totalKm = reports?.reduce((s, r) => s + r.total_distance_km, 0) ?? 0;
  const totalBusiness = reports?.reduce((s, r) => s + r.business_distance_km, 0) ?? 0;
  const totalPrivate = reports?.reduce((s, r) => s + r.private_distance_km, 0) ?? 0;
  const overallPrivatePercent = totalKm > 0 ? ((totalPrivate / totalKm) * 100).toFixed(1) : '0';
  const totalBenefitValue = reports?.reduce((s, r) => s + (r.benefit_value_sek ?? 0), 0) ?? 0;

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const months = [
    'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
    'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Förmånsbilsrapport</h1>
        <div className="flex items-center gap-3">
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
          >
            {months.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-lg shadow-sm border p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-500 mb-4">Sammanfattning - alla förmånsbilar</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-400">Total sträcka</p>
            <p className="text-lg font-bold text-gray-900">{formatDistance(totalKm)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Tjänstekörning</p>
            <p className="text-lg font-bold text-blue-600">{formatDistance(totalBusiness)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Privatkörning</p>
            <p className="text-lg font-bold text-orange-600">{formatDistance(totalPrivate)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Privatandel</p>
            <p className="text-lg font-bold text-gray-900">{overallPrivatePercent}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Förmånsvärde</p>
            <p className="text-lg font-bold text-gray-900">{totalBenefitValue.toLocaleString('sv-SE')} kr</p>
          </div>
        </div>
        {/* Visual bar */}
        {totalKm > 0 && (
          <div className="mt-4">
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${((totalBusiness / totalKm) * 100)}%` }}
                title={`Tjänst: ${formatDistance(totalBusiness)}`}
              />
              <div
                className="bg-orange-400 transition-all"
                style={{ width: `${((totalPrivate / totalKm) * 100)}%` }}
                title={`Privat: ${formatDistance(totalPrivate)}`}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>Tjänst ({((totalBusiness / totalKm) * 100).toFixed(1)}%)</span>
              <span>Privat ({overallPrivatePercent}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar förmånsbilsdata...</div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Förare</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fordon</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total km</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tjänst km</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Privat km</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Privat %</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Förmånsvärde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports?.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{r.driver?.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {r.vehicle?.registration_number ?? '-'}
                    <span className="text-xs text-gray-400 ml-1">
                      {r.vehicle?.make} {r.vehicle?.model}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{formatDistance(r.total_distance_km)}</td>
                  <td className="px-4 py-3 text-sm text-blue-600 text-right">{formatDistance(r.business_distance_km)}</td>
                  <td className="px-4 py-3 text-sm text-orange-600 text-right">{formatDistance(r.private_distance_km)}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    <span className={`font-medium ${r.private_percentage > 50 ? 'text-red-600' : 'text-gray-900'}`}>
                      {r.private_percentage.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    {r.benefit_value_sek != null ? `${r.benefit_value_sek.toLocaleString('sv-SE')} kr` : '-'}
                  </td>
                </tr>
              ))}
              {reports?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Ingen förmånsbilsdata för vald period.
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
