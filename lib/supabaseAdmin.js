import { createClient } from '@supabase/supabase-js';

// Server-side only — uses service role key to bypass RLS for profile lookups
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
