import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is missing. Please check your environment variables.");
}
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

if (supabaseUrl && supabaseAnonKey) {
  console.log("Supabase client initialized successfully.");
} else {
  console.warn("Supabase initialization failed due to missing environment variables.");
}
