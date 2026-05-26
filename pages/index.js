import { createServerSupabaseClient } from '../lib/supabaseServer';
import { createAdminClient } from '../lib/supabaseAdmin';

export default function Home() {
  return null;
}

export async function getServerSideProps({ req, res }) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (!profile) return { redirect: { destination: '/login', permanent: false } };
  if (profile.role === 'manager') return { redirect: { destination: '/admin', permanent: false } };

  return { redirect: { destination: '/dashboard', permanent: false } };
}
