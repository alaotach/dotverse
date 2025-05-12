import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL and/or Anon Key are missing. Make sure to set them in your .env file.");
  // You could throw an error here or handle it gracefully depending on your app's needs
  // throw new Error("Supabase URL and Anon Key must be defined in .env");
}

// Ensure that even if the variables are undefined, createClient is called with string | undefined
// to avoid type errors, though the runtime check above should ideally prevent this.
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
