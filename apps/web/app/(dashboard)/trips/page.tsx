'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../../lib/supabase/client';
import TripTable from '../../components/TripTable';
import type { TripFilter } from '@korjournal/shared';

export default function TripsPage() {
  const supabase = createBrowserClient();
  const [filter, setFilter] = useState<TripFilter>({});
  const [page, setPage] = useState(0);
  const pageSize = 25;

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
    queryFn: () => supabase.from('vehicles').select('id, registration_number').eq('is_active', true),
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: () => supabase.from('profiles').select('id, full_name'),
  });

  const totalPages = Math.ceil((data?.count ?? 0) / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resor</h1>
        <span className="text-sm text-gray-500">{data?.count ?? 0} resor totalt</span>
      </div>

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
              {vehicles?.data?.map((v) => (
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
              {drivers?.data?.map((d) => (
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
          <TripTable trips={data?.data ?? []} />

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
