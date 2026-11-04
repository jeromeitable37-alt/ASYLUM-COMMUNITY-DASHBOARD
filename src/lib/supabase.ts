import { createClient } from '@supabase/supabase-js';
// Supabase is used only for existing identity sessions and profile-image storage.
// All dashboard tables are now served by /api/dashboard backed by Neon.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabasePublishableKey) console.warn('Supabase authentication settings missing');
export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabasePublishableKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
