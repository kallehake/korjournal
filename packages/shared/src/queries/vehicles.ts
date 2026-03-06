import type { TypedSupabaseClient } from '../supabase';
import type { VehicleInsert } from '../types';

export async function getVehicles(client: TypedSupabaseClient, activeOnly = true) {
  let query = client.from('vehicles').select('*').order('registration_number');
  if (activeOnly) query = query.eq('is_active', true);
  return query;
}

export async function getVehicle(client: TypedSupabaseClient, id: string) {
  return client.from('vehicles').select('*').eq('id', id).single();
}

export async function createVehicle(client: TypedSupabaseClient, vehicle: VehicleInsert) {
  return client.from('vehicles').insert(vehicle).select().single();
}

export async function updateVehicle(client: TypedSupabaseClient, id: string, updates: Partial<VehicleInsert>) {
  return client.from('vehicles').update(updates).eq('id', id).select().single();
}

export async function deleteVehicle(client: TypedSupabaseClient, id: string) {
  return client.from('vehicles').update({ is_active: false }).eq('id', id);
}
