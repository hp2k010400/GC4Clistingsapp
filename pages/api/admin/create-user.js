import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, full_name, location, role } = req.body;
  if (!email || !password || !full_name || !location || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const validLocations = ['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton', 'Returns'];
  const validRoles = ['employee', 'manager'];
  if (!validLocations.includes(location)) return res.status(400).json({ error: 'Invalid location.' });
  if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role.' });

  // Service role client — only used server-side, never exposed to browser
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify the caller is a manager
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorised.' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Unauthorised.' });

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (callerProfile?.role !== 'manager') return res.status(403).json({ error: 'Forbidden.' });

  // Create the auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) return res.status(400).json({ error: createErr.message });

  // Insert their profile
  const { error: profileErr } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name,
    location,
    role,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return res.status(500).json({ error: 'Failed to create profile.' });
  }

  return res.status(200).json({ success: true });
}
