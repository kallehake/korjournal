'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';

export default function ExportPage() {
  const supabase = createBrowserClient();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [tripType, setTripType] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, registration_number').eq('is_active', true);
      return data;
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name');
      return data;
    },
  });

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (vehicleId) params.set('vehicle_id', vehicleId);
      if (driverId) params.set('driver_id', driverId);
      if (tripType) params.set('trip_type', tripType);

      const functionName = format === 'xlsx' ? 'export-excel' : 'export-pdf';
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}?${params}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) throw new Error('Export misslyckades');

      const blob = await response.blob();

      if (format === 'pdf') {
        // Open HTML in new tab for printing
        const html = await blob.text();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
        }
      } else {
        // Download CSV file
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `korjournal_${dateFrom}_${dateTo}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }
    } catch (error) {
      alert('Kunde inte exportera. Försök igen.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Exportera körjournal</h1>

      <div className="bg-white rounded-lg shadow-sm border p-6 max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">Välj period och filter</h2>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Från datum</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Till datum</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fordon</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Alla fordon</option>
              {vehicles?.map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Förare</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Alla förare</option>
              {drivers?.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Restyp</label>
            <select
              value={tripType}
              onChange={(e) => setTripType(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="">Alla typer</option>
              <option value="business">Tjänsteresor</option>
              <option value="private">Privatresor</option>
            </select>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Exportformat</h3>
          <div className="flex gap-3">
            <button
              onClick={() => handleExport('xlsx')}
              disabled={exporting}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {exporting ? 'Exporterar...' : 'Excel (CSV)'}
              <span className="block text-xs opacity-75 mt-1">Skatteverket-format, öppnas i Excel</span>
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50"
            >
              {exporting ? 'Exporterar...' : 'PDF'}
              <span className="block text-xs opacity-75 mt-1">Utskriftsvänlig rapport</span>
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-xs text-blue-700">
            Exporten följer Skatteverkets krav för körjournal och inkluderar: datum, tid, mätarställning,
            adresser, ändamål, besökt person och restyp. En sammanfattning med total körsträcka
            uppdelad på tjänste- och privatresor läggs till automatiskt.
          </p>
        </div>
      </div>
    </div>
  );
}
