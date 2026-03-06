import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types/database';

export type TypedSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: Parameters<typeof createClient>[2]
): TypedSupabaseClient {
  return createClient<Database>(url, anonKey, options);
}
