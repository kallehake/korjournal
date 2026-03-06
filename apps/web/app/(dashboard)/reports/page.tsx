'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import type { ReportSchedule } from '@korjournal/shared';
import { formatDate, formatDistance, formatCo2 } from '@korjournal/shared';

const sectionOptions = [
  { value: 'trips', label: 'Resor' },
  { value: 'distance', label: 'Sträckor' },
  { value: 'co2', label: 'CO2-utsläpp' },
  { value: 'fuel', label: 'Bränsle' },
  { value: 'congestion_tax', label: 'Trängselskatt' },
  { value: 'benefit', label: 'Förmånsbilar' },
];

const frequencyOptions = [
  { value: 'monthly', label: 'Månadsvis' },
  { value: 'weekly', label: 'Veckovis' },
  { value: 'quarterly', label: 'Kvartalsvis' },
];

export default function ReportsPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    frequency: 'monthly',
    day_of_month: 1,
    recipients: '',
    include_sections: ['trips', 'distance'] as string[],
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['report_schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_schedules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ReportSchedule[];
    },
  });

  // Mock generated reports - in production these would come from a reports table
  const { data: reportData } = useQuery({
    queryKey: ['report-summary', expandedReport],
    enabled: !!expandedReport,
    queryFn: async () => {
      // Fetch summary data for the selected period
      const { data: trips } = await supabase
        .from('trips')
        .select('id, distance_km, trip_type, co2_kg')
        .eq('status', 'completed');

      const { data: fuelLogs } = await supabase
        .from('fuel_logs')
        .select('cost_sek, liters');

      const { data: congestion } = await supabase
        .from('congestion_tax_passages')
        .select('amount_sek');

      const totalTrips = trips?.length ?? 0;
      const totalDistance = trips?.reduce((s, t) => s + (t.distance_km ?? 0), 0) ?? 0;
      const totalCo2 = trips?.reduce((s, t) => s + (t.co2_kg ?? 0), 0) ?? 0;
      const businessTrips = trips?.filter((t) => t.trip_type === 'business').length ?? 0;
      const privateTrips = trips?.filter((t) => t.trip_type === 'private').length ?? 0;
      const totalFuelCost = fuelLogs?.reduce((s, f) => s + (f.cost_sek ?? 0), 0) ?? 0;
      const totalFuelLiters = fuelLogs?.reduce((s, f) => s + (f.liters ?? 0), 0) ?? 0;
      const totalCongestionTax = congestion?.reduce((s, c) => s + (c.amount_sek ?? 0), 0) ?? 0;

      return {
        totalTrips,
        businessTrips,
        privateTrips,
        totalDistance,
        totalCo2,
        totalFuelCost,
        totalFuelLiters,
        totalCongestionTax,
      };
    },
  });

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        frequency: form.frequency,
        day_of_month: form.day_of_month,
        recipients: form.recipients.split(',').map((r) => r.trim()).filter(Boolean),
        include_sections: form.include_sections,
        vehicle_ids: [],
        driver_ids: [],
        is_active: true,
      };
      const { error } = await supabase.from('report_schedules').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report_schedules'] });
      setShowScheduleForm(false);
      setForm({ name: '', frequency: 'monthly', day_of_month: 1, recipients: '', include_sections: ['trips', 'distance'] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      // Placeholder - would trigger report generation via API
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
  });

  // Generate mock report periods
  const now = new Date();
  const reportPeriods = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long' }),
    };
  });

  function toggleSection(section: string) {
    setForm((f) => ({
      ...f,
      include_sections: f.include_sections.includes(section)
        ? f.include_sections.filter((s) => s !== section)
        : [...f.include_sections, section],
    }));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rapporter</h1>
        <div className="flex gap-3">
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="rounded-lg border border-primary-600 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
          >
            {generateMutation.isPending ? 'Genererar...' : 'Generera rapport'}
          </button>
          <button
            onClick={() => setShowScheduleForm(true)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Ny schemaläggning
          </button>
        </div>
      </div>

      {/* Schedule form modal */}
      {showScheduleForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ny rapportschemaläggning</h2>
            <form onSubmit={(e) => { e.preventDefault(); saveScheduleMutation.mutate(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
                <input
                  type="text"
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="T.ex. Månadsrapport - alla fordon"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frekvens</label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  >
                    {frequencyOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dag i månaden</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className="w-full border rounded-md px-3 py-2 text-sm"
                    value={form.day_of_month}
                    onChange={(e) => setForm({ ...form, day_of_month: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mottagare (kommaseparerade e-post)</label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={form.recipients}
                  onChange={(e) => setForm({ ...form, recipients: e.target.value })}
                  placeholder="admin@foretag.se, chef@foretag.se"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Inkludera sektioner</label>
                <div className="flex flex-wrap gap-2">
                  {sectionOptions.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleSection(s.value)}
                      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                        form.include_sections.includes(s.value)
                          ? 'bg-primary-100 border-primary-300 text-primary-800'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowScheduleForm(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">
                  Avbryt
                </button>
                <button type="submit" disabled={saveScheduleMutation.isPending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {saveScheduleMutation.isPending ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedules */}
      {schedulesLoading ? null : schedules && schedules.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Schemaläggningar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {schedules.map((s) => (
              <div key={s.id} className="bg-white rounded-lg shadow-sm border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{s.name}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {frequencyOptions.find((f) => f.value === s.frequency)?.label ?? s.frequency} | Dag {s.day_of_month}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {s.is_active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.include_sections.map((sec) => (
                    <span key={sec} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {sectionOptions.find((o) => o.value === sec)?.label ?? sec}
                    </span>
                  ))}
                </div>
                {s.last_sent_at && (
                  <p className="text-xs text-gray-400 mt-2">Senast skickad: {formatDate(s.last_sent_at)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated reports list */}
      <h2 className="text-lg font-semibold text-gray-700 mb-3">Genererade rapporter</h2>
      <div className="space-y-3">
        {reportPeriods.map((period) => (
          <div key={period.id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div
              className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
              onClick={() => setExpandedReport(expandedReport === period.id ? null : period.id)}
            >
              <div>
                <h3 className="font-medium text-gray-900 capitalize">{period.label}</h3>
                <p className="text-xs text-gray-400">Period: {period.id}</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                  Ladda ner
                </button>
                <svg
                  className={`h-5 w-5 text-gray-400 transition-transform ${expandedReport === period.id ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>

            {expandedReport === period.id && reportData && (
              <div className="border-t px-4 py-4 bg-gray-50">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-gray-200">
                    <tr>
                      <td className="py-2 text-gray-600">Totalt antal resor</td>
                      <td className="py-2 text-right font-medium text-gray-900">{reportData.totalTrips}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">Tjänsteresor</td>
                      <td className="py-2 text-right font-medium text-gray-900">{reportData.businessTrips}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">Privatresor</td>
                      <td className="py-2 text-right font-medium text-gray-900">{reportData.privateTrips}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">Total sträcka</td>
                      <td className="py-2 text-right font-medium text-gray-900">{formatDistance(reportData.totalDistance)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">CO2-utsläpp</td>
                      <td className="py-2 text-right font-medium text-gray-900">{formatCo2(reportData.totalCo2)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">Bränslekostnad</td>
                      <td className="py-2 text-right font-medium text-gray-900">{reportData.totalFuelCost.toLocaleString('sv-SE')} kr</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">Bränsleförbrukning</td>
                      <td className="py-2 text-right font-medium text-gray-900">{reportData.totalFuelLiters.toFixed(1)} liter</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-600">Trängselskatt</td>
                      <td className="py-2 text-right font-medium text-gray-900">{reportData.totalCongestionTax.toLocaleString('sv-SE')} kr</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
