import { createSupabaseClient, type TypedSupabaseClient } from '@korjournal/shared';
import { Platform } from 'react-native';

let storage: any;

if (Platform.OS !== 'web') {
  const SecureStore = require('expo-secure-store');
  storage = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  };
} else {
  storage = {
    getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
    setItem: (key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
    removeItem: (key: string) => { localStorage.removeItem(key); return Promise.resolve(); },
  };
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase: TypedSupabaseClient = createSupabaseClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
