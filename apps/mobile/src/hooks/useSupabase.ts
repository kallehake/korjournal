import { supabase } from '@/lib/supabase';
import type { TypedSupabaseClient } from '@korjournal/shared';

export function useSupabase(): TypedSupabaseClient {
  return supabase;
}
