'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../../../lib/supabase/client';
import TripTable from '../../../components/TripTable';
import type { TripFilter } from '@korjournal/shared';
import type { TripRow } from '../../../components/TripTable';

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  start_time: '',
  end_time: '',
  start_address: '',
  end_address: '',
  odometer_start: '',
  odometer_end: '',
  trip_type: 'private' as 'business' | 'private',
  purpose: '',
  visited_person: '',
  vehicle_id: '',
  notes: '',
};

export default function TripsPage() {
  const supabase = createBrowserClient();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TripFilter>({});
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [showNewTrip, setShowNewTrip] = useState(false);
  const [newTrip, setNewTrip] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['trips', filter, page],
    queryFn: async () => {
      let query = supabase
        .from('trips')
        .select(`
          *,
          driver:profiles!driver_id(id, full_name),
          vehicle:vehicles!vehicle_id(id, registration_number, make, model),
          customer:customers!customer_id(id, name)
        `, { count: 'exact' })
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (filter.dateFrom) query = query.gte('date', filter.dateFrom);
      if (filter.dateTo) query = query.lte('date', filter.dateTo);
      if (filter.vehicleId) query = query.eq('vehicle_id', filter.vehicleId);
      if (filter.driverId) query = query.eq('driver_id', filter.driverId);
      if (filter.tripType) query = query.eq('trip_type', filter.tripType);
      if (filter.search) {
        query = query.or(
          `start_address.ilike.%${filter.search}%,end_address.ilike.%${filter.search}%,purpose.ilike.%${filter.search}%`
        );
      }

      return query;
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

  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  const saveTripMutation = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from('profiles').select('id, organization_id').single();
      if (!profile) throw new Error('Profil saknas');
      const odomStart = newTrip.odometer_start ? parseInt(newTrip.odometer_start) : null;
      const odomEnd = newTrip.odometer_end ? parseInt(newTrip.odometer_end) : null;
      const startDt = newTrip.start_time ? `${newTrip.date}T${newTrip.start_time}:00` : `${newTrip.date}T00:00:00`;
      const endDt = newTrip.end_time ? `${newTrip.date}T${newTrip.end_time}:00` : null;
      const { error } = await supabase.from('trips').insert({
        organization_id: profile.organization_id,
        driver_id: profile.id,
        vehicle_id: newTrip.vehicle_id || null,
        date: newTrip.date,
        start_time: startDt,
        end_time: endDt,
        start_address: newTrip.start_address,
        end_address: newTrip.end_address || null,
        odometer_start: odomStart,
        odometer_end: odomEnd,
        trip_type: newTrip.trip_type,
        purpose: newTrip.purpose || null,
        visited_person: newTrip.visited_person || null,
        notes: newTrip.notes || null,
        status: 'completed',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setShowNewTrip(false);
      setNewTrip(emptyForm);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resor</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{data?.count ?? 0} resor totalt</span>
          <button onClick={() => setShowNewTrip(true)} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            + Ny resa
          </button>
        </div>
      </div>

      {/* Manuell resa-modal */}
      {showNewTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Lägg till resa manuellt</h2>
            <form onSubmit={(e) => { e.preventDefault(); saveTripMutation.mutate(); }} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Datum *</label>
                  <input required type="date" className="w-full border rounded-md px-3 py-2 text-sm"
                    value={newTrip.date} onChange={e => setNewTrip({...newTrip, date: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Starttid</label>
                  <input type="time" className="w-full border rounded-md px-3 py-2 text-sm"
                    value={newTrip.start_time} onChange={e => setNewTrip({...newTrip, start_time: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sluttid</label>
                  <input type="time" className="w-full border rounded-md px-3 py-2 text-sm"
                    value={newTrip.end_time} onChange={e => setNewTrip({...newTrip, end_time: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Startadress *</label>
                <input required type="text" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="T.ex. Hindåsvägen 12, Hindås"
                  value={newTrip.start_address} onChange={e => setNewTrip({...newTrip, start_address: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Slutadress</label>
                <input type="text" className="w-full border rounded-md px-3 py-2 text-sm" placeholder="T.ex. Kungsgatan 5, Göteborg"
                  value={newTrip.end_address} onChange={e => setNewTrip({...newTrip, end_address: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mätare start (km)</label>
                  <input type="number" className="w-full border rounded-md px-3 py-2 text-sm"
                    value={newTrip.odometer_start} onChange={e => setNewTrip({...newTrip, odometer_start: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mätare slut (km)</label>
                  <input type="number" className="w-full border rounded-md px-3 py-2 text-sm"
                    value={newTrip.odometer_end} onChange={e => setNewTrip({...newTrip, odometer_end: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Restyp *</label>
                  <select required className="w-full border rounded-md px-3 py-2 text-sm"
                    value={newTrip.trip_type} onChange={e => setNewTrip({...newTrip, trip_type: e.target.value as any})}>
                    <option value="private">Privatresa</option>
                    <option value="business">Tjänsteresa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fordon</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm"
                    value={newTrip.vehicle_id} onChange={e => setNewTrip({...newTrip, vehicle_id: e.target.value})}>
                    <option value="">Välj fordon</option>
                    {vehicles?.map(v => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Ändamål {newTrip.trip_type === 'business' && <span className="text-red-500">*</span>}
                </label>
                <input type="text" required={newTrip.trip_type === 'business'}
                  className="w-full border rounded-md px-3 py-2 text-sm" placeholder="T.ex. Kundbesök, möte, leverans..."
                  value={newTrip.purpose} onChange={e => setNewTrip({...newTrip, purpose: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Besökt person / företag</label>
                <input type="text" className="w-full border rounded-md px-3 py-2 text-sm"
                  value={newTrip.visited_person} onChange={e => setNewTrip({...newTrip, visited_person: e.target.value})} />
              </div>
              {saveTripMutation.error && (
                <p className="text-sm text-red-600">{String(saveTripMutation.error)}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowNewTrip(false); setNewTrip(emptyForm); }}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Avbryt</button>
                <button type="submit" disabled={saveTripMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
                  {saveTripMutation.isPending ? 'Sparar...' : 'Spara resa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Från datum</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={filter.dateFrom ?? ''}
              onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Till datum</label>
            <input
              type="date"
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={filter.dateTo ?? ''}
              onChange={(e) => setFilter({ ...filter, dateTo: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Fordon</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={filter.vehicleId ?? ''}
              onChange={(e) => setFilter({ ...filter, vehicleId: e.target.value || undefined })}
            >
              <option value="">Alla fordon</option>
              {vehicles?.map((v) => (
                <option key={v.id} value={v.id}>{v.registration_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Förare</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={filter.driverId ?? ''}
              onChange={(e) => setFilter({ ...filter, driverId: e.target.value || undefined })}
            >
              <option value="">Alla förare</option>
              {drivers?.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Restyp</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm"
              value={filter.tripType ?? ''}
              onChange={(e) => setFilter({ ...filter, tripType: (e.target.value || undefined) as any })}
            >
              <option value="">Alla typer</option>
              <option value="business">Tjänsteresa</option>
              <option value="private">Privatresa</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <input
            type="text"
            placeholder="Sök adress, ändamål..."
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={filter.search ?? ''}
            onChange={(e) => setFilter({ ...filter, search: e.target.value || undefined })}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Laddar resor...</div>
      ) : (
        <>
          <TripTable trips={(data?.data ?? []) as TripRow[]} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-4 py-2 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
              >
                Föregående
              </button>
              <span className="text-sm text-gray-500">
                Sida {page + 1} av {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 text-sm border rounded-md disabled:opacity-50 hover:bg-gray-50"
              >
                Nästa
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
