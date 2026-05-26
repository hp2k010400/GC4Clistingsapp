import { createServerClient, serializeCookieHeader } from '@supabase/ssr';

export function createServerSupabaseClient(req, res) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          // Use req.cookies (pre-parsed by Next.js) instead of raw header parsing
          return Object.entries(req.cookies ?? {}).map(([name, value]) => ({
            name,
            value: value ?? '',
          }));
        },
        setAll(cookiesToSet) {
          const existing = res.getHeader('Set-Cookie');
          const existingArray = existing
            ? Array.isArray(existing) ? existing : [existing]
            : [];
          res.setHeader('Set-Cookie', [
            ...existingArray,
            ...cookiesToSet.map(({ name, value, options }) =>
              serializeCookieHeader(name, value, options)
            ),
          ]);
        },
      },
    }
  );
}
