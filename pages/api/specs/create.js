import { createClient } from '@supabase/supabase-js';

const CLUB_TYPES = ['drivers', 'fairways', 'hybrids', 'single_irons', 'irons', 'wedges'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

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

  const { club_type, brand, model_name, year, variants } = req.body;

  if (!club_type || !CLUB_TYPES.includes(club_type)) {
    return res.status(400).json({ error: 'A valid club_type is required.' });
  }
  if (!model_name || !model_name.trim()) {
    return res.status(400).json({ error: 'model_name is required.' });
  }
  if (!Array.isArray(variants) || variants.length === 0) {
    return res.status(400).json({ error: 'At least one variant is required.' });
  }

  const { data: model, error: modelErr } = await admin
    .from('spec_models')
    .insert({
      club_type,
      brand: brand?.trim() || null,
      model_name: model_name.trim(),
      year: year ? Number(year) : null,
      created_by: user.id,
    })
    .select()
    .single();

  if (modelErr) return res.status(400).json({ error: modelErr.message });

  const variantRows = variants.map(v => ({
    model_id: model.id,
    loft: v.loft?.trim() || null,
    mens_length: v.mens_length?.trim() || null,
    womens_length: v.womens_length?.trim() || null,
    notes: v.notes?.trim() || null,
  }));

  const { error: variantErr } = await admin.from('spec_variants').insert(variantRows);
  if (variantErr) {
    await admin.from('spec_models').delete().eq('id', model.id);
    return res.status(400).json({ error: variantErr.message });
  }

  return res.status(200).json({ success: true, model_id: model.id });
}
