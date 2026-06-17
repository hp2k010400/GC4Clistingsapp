import { createServerSupabaseClient } from '../../../lib/supabaseServer';
import { createAdminClient } from '../../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return res.status(401).json({ error: 'Unauthorised.' });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', session.user.id).single();
  if (!profile || (profile.role !== 'manager' && profile.role !== 'supervisor')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { fromDate } = req.query;

  let q = admin
    .from('listings')
    .select('*, profiles(full_name, location), batches(difficulty, comments, description, photo_urls)')
    .order('created_at', { ascending: false })
    .limit(500000);
  if (fromDate) q = q.gte('date', fromDate);

  const [{ data: allListings }, { data: allEmployees }, { data: allNotes }] = await Promise.all([
    q,
    admin.from('profiles').select('*').order('full_name'),
    admin.from('listings')
      .select('*, profiles(full_name, location)')
      .not('manager_note', 'is', null)
      .order('note_priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10000),
  ]);

  return res.status(200).json({
    listings: allListings || [],
    employees: allEmployees || [],
    notes: allNotes || [],
  });
}
