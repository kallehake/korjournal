import type { TypedSupabaseClient } from '../supabase';
import type { CustomerInsert } from '../types';

export async function getCustomers(client: TypedSupabaseClient, activeOnly = true) {
  let query = client.from('customers').select('*').order('name');
  if (activeOnly) query = query.eq('is_active', true);
  return query;
}

export async function getCustomer(client: TypedSupabaseClient, id: string) {
  return client.from('customers').select('*').eq('id', id).single();
}

export async function createCustomer(client: TypedSupabaseClient, customer: CustomerInsert) {
  return client.from('customers').insert(customer).select().single();
}

export async function updateCustomer(client: TypedSupabaseClient, id: string, updates: Partial<CustomerInsert>) {
  return client.from('customers').update(updates).eq('id', id).select().single();
}

export async function deleteCustomer(client: TypedSupabaseClient, id: string) {
  return client.from('customers').update({ is_active: false }).eq('id', id);
}
