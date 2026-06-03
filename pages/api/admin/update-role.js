import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, role } = req.body;
  if (!userId || !['employee', 'manager', 'supervisor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'userId and valid role are required.' });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorised.' });

  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Unauthorised.' });

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (callerProfile?.role !== 'manager') return res.status(403).json({ error: 'Forbidden.' });

  const { error } = await admin.from('profiles').update({ role }).eq('id', userId);
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ success: true });
}
