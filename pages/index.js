import { createServerSupabaseClient } from '../lib/supabaseServer';

export default function Home() {
  return null;
}

export async function getServerSideProps({ req, res }) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (profile?.role === 'manager') {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  return { redirect: { destination: '/dashboard', permanent: false } };
}
