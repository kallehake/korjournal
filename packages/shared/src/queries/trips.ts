import type { TypedSupabaseClient } from '../supabase';
import type { TripInsert, TripFilter, TripWithRelations } from '../types';

export async function getTrips(
  client: TypedSupabaseClient,
  filter?: TripFilter,
  page = 0,
  pageSize = 50
) {
  let query = client
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

  if (filter?.dateFrom) query = query.gte('date', filter.dateFrom);
  if (filter?.dateTo) query = query.lte('date', filter.dateTo);
  if (filter?.driverId) query = query.eq('driver_id', filter.driverId);
  if (filter?.vehicleId) query = query.eq('vehicle_id', filter.vehicleId);
  if (filter?.customerId) query = query.eq('customer_id', filter.customerId);
  if (filter?.tripType) query = query.eq('trip_type', filter.tripType);
  if (filter?.status) query = query.eq('status', filter.status);
  if (filter?.search) {
    query = query.or(`start_address.ilike.%${filter.search}%,end_address.ilike.%${filter.search}%,purpose.ilike.%${filter.search}%`);
  }

  return query;
}

export async function getTrip(client: TypedSupabaseClient, id: string) {
  return client
    .from('trips')
    .select(`
      *,
      driver:profiles!driver_id(id, full_name, email),
      vehicle:vehicles!vehicle_id(id, registration_number, make, model),
      customer:customers!customer_id(id, name)
    `)
    .eq('id', id)
    .single();
}

export async function createTrip(client: TypedSupabaseClient, trip: TripInsert) {
  return client.from('trips').insert(trip).select().single();
}

export async function updateTrip(client: TypedSupabaseClient, id: string, updates: Partial<TripInsert>) {
  return client.from('trips').update(updates).eq('id', id).select().single();
}

export async function deleteTrip(client: TypedSupabaseClient, id: string) {
  return client.from('trips').delete().eq('id', id);
}

export async function getDashboardStats(client: TypedSupabaseClient, dateFrom?: string, dateTo?: string) {
  let query = client.from('trips').select('trip_type, distance_km, status');
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);
  query = query.eq('status', 'completed');

  const { data: trips, error } = await query;
  if (error) throw error;

  const stats = {
    totalTrips: trips?.length ?? 0,
    totalDistanceKm: 0,
    businessTrips: 0,
    privateTrips: 0,
    businessDistanceKm: 0,
    privateDistanceKm: 0,
    activeVehicles: 0,
    activeDrivers: 0,
  };

  trips?.forEach((t) => {
    const dist = t.distance_km ?? 0;
    stats.totalDistanceKm += dist;
    if (t.trip_type === 'business') {
      stats.businessTrips++;
      stats.businessDistanceKm += dist;
    } else {
      stats.privateTrips++;
      stats.privateDistanceKm += dist;
    }
  });

  // Get active vehicles and drivers count
  const [vehiclesRes, driversRes] = await Promise.all([
    client.from('vehicles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    client.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  stats.activeVehicles = vehiclesRes.count ?? 0;
  stats.activeDrivers = driversRes.count ?? 0;

  return stats;
}
