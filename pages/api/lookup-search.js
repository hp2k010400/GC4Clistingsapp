import { createAdminClient } from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.status(200).json({ results: [] });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('listings')
    .select('*, profiles(full_name, location), batches(comments, description)')
    .ilike('serial_id', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ results: data || [] });
}
