// Manual trigger for daily report — for testing only
// Remove or restrict this once the scheduled function is confirmed working

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Simple auth check — only managers can trigger
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorised.' });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorised.' });
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'manager') return res.status(403).json({ error: 'Forbidden.' });

  // Import and run the report function
  const { default: reportHandler } = await import('../../../netlify/functions/daily-report.mjs');
  const result = await reportHandler();
  return res.status(result.statusCode).json(JSON.parse(result.body || '{}'));
}
