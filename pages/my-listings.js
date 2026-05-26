import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createServerSupabaseClient } from '../lib/supabaseServer';
import { createAdminClient } from '../lib/supabaseAdmin';
import { createClient } from '../lib/supabaseClient';

const GREEN = '#005F2C';
const CHECKLIST = [
  { key: 'metafields', label: 'Metafields' },
  { key: 'title', label: 'Title' },
  { key: 'price', label: 'Price' },
  { key: 'photographs', label: 'Photographs' },
  { key: 'specifications', label: 'Specifications' },
  { key: 'condition', label: 'Condition' },
];

const EMPTY_FORM = {
  serial_id: '',
  photos_comments: '',
  metafields: false,
  title: false,
  price: false,
  photographs: false,
  specifications: false,
  condition: false,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(t) {
  if (!t) return '—';
  return t.slice(0, 5);
}

export default function Dashboard({ profile, _debug }) {
  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f4' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#c0392b', fontWeight: 600, marginBottom: 12 }}>Account not set up yet — contact your manager.</p>
          <pre style={{ textAlign: 'left', background: '#eee', padding: 12, borderRadius: 6, fontSize: 11, marginBottom: 12 }}>
            {JSON.stringify(_debug, null, 2)}
          </pre>
          <a href="/login" style={{ color: '#005F2C', fontWeight: 700 }}>Back to login</a>
        </div>
      </div>
    );
  }
  const router = useRouter();
  const supabase = createClient();

  const [session, setSession] = useState(null);
  const [listings, setListings] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadData = useCallback(async () => {
    const date = today();

    const [{ data: sess }, { data: list }] = await Promise.all([
      supabase.from('daily_sessions').select('*').eq('user_id', profile.id).eq('date', date).maybeSingle(),
      supabase.from('listings').select('*').eq('user_id', profile.id).eq('date', date).order('created_at', { ascending: false }),
    ]);

    setSession(sess || { start_time: '', lunch_time: '', finish_time: '' });
    setListings(list || []);
  }, [profile.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSessionSave() {
    setSessionSaving(true);
    const date = today();
    const payload = {
      user_id: profile.id,
      date,
      start_time: session.start_time || null,
      lunch_time: session.lunch_time || null,
      finish_time: session.finish_time || null,
    };
    await supabase.from('daily_sessions').upsert(payload, { onConflict: 'user_id,date' });
    setSessionSaving(false);
    showSuccess('Times saved.');
  }

  async function handleListingSubmit(e) {
    e.preventDefault();
    if (!form.serial_id.trim()) { setError('Serial ID is required.'); return; }
    setError('');
    setSubmitting(true);
    const { error: err } = await supabase.from('listings').insert({
      user_id: profile.id,
      date: today(),
      ...form,
      serial_id: form.serial_id.trim(),
    });
    if (err) { setError('Failed to save listing. Try again.'); setSubmitting(false); return; }
    setForm(EMPTY_FORM);
    setSubmitting(false);
    showSuccess('Listing saved!');
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('Remove this listing?')) return;
    await supabase.from('listings').delete().eq('id', id);
    loadData();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function showSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 2500);
  }

  function allChecked(listing) {
    return CHECKLIST.every(c => listing[c.key]);
  }

  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  })();

  return (
    <>
      <Head><title>GC4C Listings — Dashboard</title></Head>
      <div style={{ minHeight: '100vh', background: '#f4f6f4' }}>

        {/* Top bar */}
        <div style={{
          background: GREEN,
          color: '#fff',
          padding: '0 24px',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.05em' }}>GC4C Listings</span>
            <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
              {profile.location}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
            <span style={{ opacity: 0.85 }}>{profile.full_name}</span>
            {profile.role === 'manager' && (
              <button onClick={() => router.push('/admin')} style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>← Manager View</button>
            )}
            <button onClick={handleLogout} style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}>Sign out</button>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

          {successMsg && (
            <div style={{
              background: '#d4edda',
              color: '#155724',
              border: '1px solid #c3e6cb',
              borderRadius: 7,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 600,
            }}>{successMsg}</div>
          )}

          {/* Today's session */}
          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Today's Hours — {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 14 }}>
              {[
                { key: 'start_time', label: 'Start' },
                { key: 'lunch_time', label: 'Lunch' },
                { key: 'finish_time', label: 'Finish' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type="time"
                    value={session?.[key] || ''}
                    onChange={e => setSession(s => ({ ...s, [key]: e.target.value }))}
                    style={{ ...inputStyle, width: 130 }}
                  />
                </div>
              ))}
              <button onClick={handleSessionSave} disabled={sessionSaving} style={btnStyle}>
                {sessionSaving ? 'Saving…' : 'Save Times'}
              </button>
            </div>
          </div>

          {/* Add listing form */}
          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>Log a Listing</h2>
            <form onSubmit={handleListingSubmit}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
                <div style={{ flex: '0 0 180px' }}>
                  <label style={labelStyle}>Serial ID *</label>
                  <input
                    type="text"
                    value={form.serial_id}
                    onChange={e => setForm(f => ({ ...f, serial_id: e.target.value }))}
                    style={inputStyle}
                    placeholder="e.g. GC-12345"
                  />
                </div>
                <div style={{ flex: '1 1 260px' }}>
                  <label style={labelStyle}>Photos / Comments</label>
                  <input
                    type="text"
                    value={form.photos_comments}
                    onChange={e => setForm(f => ({ ...f, photos_comments: e.target.value }))}
                    style={inputStyle}
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>Checklist</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                  {CHECKLIST.map(({ key, label }) => (
                    <label key={key} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: form[key] ? '#e8f5ee' : '#f5f5f5',
                      border: `1.5px solid ${form[key] ? GREEN : '#d0d0d0'}`,
                      borderRadius: 6,
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      userSelect: 'none',
                      transition: 'all 0.1s',
                    }}>
                      <input
                        type="checkbox"
                        checked={form[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                        style={{ accentColor: GREEN, width: 15, height: 15 }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{error}</p>}

              <button type="submit" disabled={submitting} style={{ ...btnStyle, marginTop: 16 }}>
                {submitting ? 'Saving…' : '+ Add Listing'}
              </button>
            </form>
          </div>

          {/* Today's listings */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ ...cardTitleStyle, marginBottom: 0 }}>
                Today's Listings
                <span style={{
                  marginLeft: 10,
                  background: GREEN,
                  color: '#fff',
                  borderRadius: 20,
                  padding: '2px 10px',
                  fontSize: 13,
                  fontWeight: 700,
                }}>{listings.length}</span>
              </h2>
            </div>

            {listings.length === 0 ? (
              <p style={{ color: '#999', fontSize: 13 }}>No listings logged yet today.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f0f4f0' }}>
                      <th style={thStyle}>Time</th>
                      <th style={thStyle}>Serial ID</th>
                      {CHECKLIST.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
                      <th style={thStyle}>Comments</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((l, i) => (
                      <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                        <td style={tdStyle}>{formatTime(new Date(l.created_at).toTimeString())}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{l.serial_id}</td>
                        {CHECKLIST.map(c => (
                          <td key={c.key} style={{ ...tdStyle, textAlign: 'center' }}>
                            {l[c.key]
                              ? <span style={{ color: GREEN, fontWeight: 700, fontSize: 15 }}>✓</span>
                              : <span style={{ color: '#ccc' }}>–</span>}
                          </td>
                        ))}
                        <td style={{ ...tdStyle, color: '#666', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.photos_comments || ''}
                        </td>
                        <td style={tdStyle}>
                          <button onClick={() => handleDelete(l.id)} style={{
                            background: 'none',
                            border: 'none',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: 16,
                            padding: '0 4px',
                          }} title="Remove">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {listings.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
                Complete: {listings.filter(allChecked).length} / {listings.length} &nbsp;·&nbsp;
                Incomplete: {listings.filter(l => !allChecked(l)).length}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}

const cardStyle = {
  background: '#fff',
  borderRadius: 10,
  boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
  padding: '18px 20px',
  marginBottom: 16,
};
const cardTitleStyle = {
  fontSize: 15,
  fontWeight: 700,
  color: '#1a1a1a',
  marginBottom: 0,
};
const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#555',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d0d0d0',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
  background: '#fafafa',
};
const btnStyle = {
  background: GREEN,
  color: '#fff',
  border: 'none',
  borderRadius: 7,
  padding: '9px 18px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
  letterSpacing: '0.03em',
};
const thStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  fontWeight: 700,
  fontSize: 12,
  color: '#444',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '8px 10px',
  verticalAlign: 'middle',
};

export async function getServerSideProps({ req, res }) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return { redirect: { destination: '/login', permanent: false } };

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  // managers are allowed on this page too

  return {
    props: {
      profile: profile || null,
      _debug: {
        userId: session.user.id,
        profileError: profileError?.message || null,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  };
}
