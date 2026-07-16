import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorised.' });

  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Unauthorised.' });

  const { data: callerProfile } = await admin.from('profiles').select('specs_guide_beta').eq('id', user.id).single();
  if (!callerProfile?.specs_guide_beta) return res.status(403).json({ error: 'Forbidden.' });

  const { club_type, search } = req.query;

  let query = admin
    .from('spec_models')
    .select('id, club_type, brand, model_name, year, spec_variants(id, loft, mens_length, womens_length, notes)')
    .order('brand', { ascending: true })
    .order('model_name', { ascending: true });

  if (club_type) query = query.eq('club_type', club_type);
  if (search) query = query.ilike('model_name', `%${search}%`);

  const { data, error } = await query.limit(2000);
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ models: data });
}
