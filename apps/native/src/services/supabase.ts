import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://wpwjeilkzyhwzoirltbi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwd2plaWxrenlod3pvaXJsdGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDM1OTYsImV4cCI6MjA4NjU3OTU5Nn0.M5ENENbHhUrSWbtnqhQytOiatKoXCpVJSi0u4x5qlAI',
);
