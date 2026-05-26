import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { createClient } from '../lib/supabaseClient';

const GC4C_GREEN = '#005F2C';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError('Incorrect email or password.');
      setLoading(false);
      return;
    }
    router.push('/dashboard');
  }

  return (
    <>
      <Head><title>GC4C Listings — Login</title></Head>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f6f4',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
          padding: '40px 36px',
          width: '100%',
          maxWidth: 380,
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              display: 'inline-block',
              background: GC4C_GREEN,
              color: '#fff',
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '6px 14px',
              borderRadius: 6,
              marginBottom: 12,
            }}>
              GolfClubs4Cash
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>Listings Portal</h1>
            <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>Sign in with your work account</p>
          </div>

          <form onSubmit={handleLogin}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={inputStyle}
              placeholder="you@golfclubs4cash.co.uk"
            />

            <label style={{ ...labelStyle, marginTop: 14 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={inputStyle}
              placeholder="••••••••"
            />

            {error && (
              <p style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: 20,
                padding: '11px 0',
                background: loading ? '#aaa' : GC4C_GREEN,
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '0.03em',
              }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#333',
  marginBottom: 5,
};

const inputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #d0d0d0',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
  background: '#fafafa',
};

export async function getServerSideProps({ req, res }) {
  const { createServerSupabaseClient } = await import('../lib/supabaseServer');
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return { redirect: { destination: '/', permanent: false } };
  return { props: {} };
}
