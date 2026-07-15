import { createServerSupabaseClient } from '../../../lib/supabaseServer';
import { createAdminClient } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return res.status(401).json({ error: 'Unauthorised.' });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', session.user.id).single();
  if (!profile || (profile.role !== 'manager' && profile.role !== 'supervisor')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { userId, active } = req.body;
  if (typeof active !== 'boolean' || !userId) return res.status(400).json({ error: 'Invalid params.' });

  await admin.from('profiles').update({ active }).eq('id', userId);
  return res.status(200).json({ ok: true });
}
