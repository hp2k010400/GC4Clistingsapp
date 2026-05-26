import { createClient } from '@supabase/supabase-js';

const EMPLOYEES = [
  // Edinburgh
  { full_name: 'Steven Kilgour',    email: 'steven.kilgour@golfclubs4cash.co.uk',    location: 'Edinburgh' },
  { full_name: 'Lennon McMillan',   email: 'lennon.mcmillan@golfclubs4cash.co.uk',   location: 'Edinburgh' },
  { full_name: 'Greg Shillinglaw',  email: 'greg.shillinglaw@golfclubs4cash.co.uk',  location: 'Edinburgh' },
  { full_name: 'David Flynn',       email: 'david.flynn@golfclubs4cash.co.uk',       location: 'Edinburgh' },
  { full_name: 'Jamie Anderson',    email: 'jamie.anderson@golfclubs4cash.co.uk',    location: 'Edinburgh' },
  { full_name: 'Magnus Braby',      email: 'magnus.braby@golfclubs4cash.co.uk',      location: 'Edinburgh' },
  { full_name: 'Danny Sinclair',    email: 'danny.sinclair@golfclubs4cash.co.uk',    location: 'Edinburgh' },
  { full_name: 'Max Johnstone',     email: 'max.johnstone@golfclubs4cash.co.uk',     location: 'Edinburgh' },
  { full_name: 'Jakob Dalland',     email: 'jakob.dalland@golfclubs4cash.co.uk',     location: 'Edinburgh' },
  { full_name: 'Thomas White',      email: 'thomas.white@golfclubs4cash.co.uk',      location: 'Edinburgh' },
  // Warrington
  { full_name: 'Earl Rafferty',     email: 'earl.rafferty@golfclubs4cash.co.uk',     location: 'Warrington' },
  { full_name: 'Dylan Buckley',     email: 'dylan.buckley@golfclubs4cash.co.uk',     location: 'Warrington' },
  { full_name: 'Megan Schofield',   email: 'megan.schofield@golfclubs4cash.co.uk',   location: 'Warrington' },
  { full_name: 'Euan Miller',       email: 'euan.miller@golfclubs4cash.co.uk',       location: 'Warrington' },
  { full_name: 'Oscar Doran',       email: 'oscar.doran@golfclubs4cash.co.uk',       location: 'Warrington' },
  { full_name: 'Lewis King',        email: 'lewis.king@golfclubs4cash.co.uk',        location: 'Warrington' },
  // Milton Keynes
  { full_name: 'Morgan Jones',      email: 'morgan.jones@golfclubs4cash.co.uk',      location: 'Milton Keynes' },
  { full_name: 'Anish Bhadresa',    email: 'anish.bhadresa@golfclubs4cash.co.uk',    location: 'Milton Keynes' },
  { full_name: 'Harvey Gregory',    email: 'harvey.gregory@golfclubs4cash.co.uk',    location: 'Milton Keynes' },
  { full_name: 'Oliver Korman',     email: 'oliver.korman@golfclubs4cash.co.uk',     location: 'Milton Keynes' },
  // Southampton
  { full_name: 'Eithan Habgood',    email: 'eithan.habgood@golfclubs4cash.co.uk',    location: 'Southampton' },
  { full_name: 'Kye Coletta',       email: 'kye.coletta@golfclubs4cash.co.uk',       location: 'Southampton' },
  { full_name: 'Anton Flood',       email: 'anton.flood@golfclubs4cash.co.uk',       location: 'Southampton' },
  { full_name: 'Ryan Harvey',       email: 'ryan.harvey@golfclubs4cash.co.uk',       location: 'Southampton' },
  { full_name: 'Christopher Cleary',email: 'christopher.cleary@golfclubs4cash.co.uk',location: 'Southampton' },
];

const PASSWORD = 'listingsapp2026';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify the caller is a manager
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorised.' });

  const { data: { user }, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Unauthorised.' });

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (callerProfile?.role !== 'manager') return res.status(403).json({ error: 'Forbidden.' });

  const results = { created: [], skipped: [], failed: [] };

  for (const emp of EMPLOYEES) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emp.email,
      password: PASSWORD,
      email_confirm: true,
    });

    if (createErr) {
      if (createErr.message.includes('already been registered') || createErr.message.includes('already exists')) {
        results.skipped.push(emp.full_name);
      } else {
        results.failed.push({ name: emp.full_name, reason: createErr.message });
      }
      continue;
    }

    const { error: profileErr } = await admin.from('profiles').insert({
      id: created.user.id,
      full_name: emp.full_name,
      location: emp.location,
      role: 'employee',
    });

    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      results.failed.push({ name: emp.full_name, reason: profileErr.message });
    } else {
      results.created.push(emp.full_name);
    }
  }

  return res.status(200).json(results);
}
