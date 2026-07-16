import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createServerSupabaseClient } from '../lib/supabaseServer';
import { createAdminClient } from '../lib/supabaseAdmin';
import { createClient } from '../lib/supabaseClient';

const GREEN = '#005F2C';

const CLUB_TYPES = [
  { key: 'drivers', label: 'Drivers' },
  { key: 'fairways', label: 'Fairways' },
  { key: 'hybrids', label: 'Hybrids' },
  { key: 'single_irons', label: 'Single Irons' },
  { key: 'irons', label: 'Irons' },
  { key: 'wedges', label: 'Wedges' },
];

const EMPTY_FORM = {
  club_type: 'irons',
  brand: '',
  model_name: '',
  year: '',
  variants: [{ loft: '', mens_length: '', womens_length: '', notes: '' }],
};

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#555',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
};
const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #d0d0d0',
  borderRadius: 6, fontSize: 13, outline: 'none', background: '#fafafa',
};

export default function SpecsGuide({ profile }) {
  const router = useRouter();
  const supabase = createClient();

  const [clubType, setClubType] = useState('irons');
  const [search, setSearch] = useState('');
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const params = new URLSearchParams({ club_type: clubType });
    if (search.trim()) params.set('search', search.trim());
    const res = await fetch(`/api/specs/list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to load specs.');
      setModels([]);
    } else {
      setModels(data.models);
    }
    setLoading(false);
  }, [clubType, search]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function updateVariant(i, key, value) {
    setForm(f => {
      const variants = [...f.variants];
      variants[i] = { ...variants[i], [key]: value };
      return { ...f, variants };
    });
  }

  function addVariantRow() {
    setForm(f => ({ ...f, variants: [...f.variants, { loft: '', mens_length: '', womens_length: '', notes: '' }] }));
  }

  function removeVariantRow(i) {
    setForm(f => ({ ...f, variants: f.variants.filter((_, idx) => idx !== i) }));
  }

  async function handleAddModel(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/specs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setSaveError(data.error || 'Failed to save.');
      return;
    }
    setShowAdd(false);
    setForm({ ...EMPTY_FORM, club_type: clubType });
    fetchModels();
  }

  const needsMultipleVariants = clubType !== 'irons';

  return (
    <>
      <Head><title>GC4C Specs Guide</title></Head>
      <div style={{ minHeight: '100vh', background: '#f4f6f4' }}>

        <div style={{
          background: GREEN, color: '#fff', padding: '0 24px', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.05em' }}>GC4C Specs Guide</span>
            <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
              Beta
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <button onClick={() => router.push('/admin')} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Admin</button>
            <span style={{ opacity: 0.85 }}>{profile.full_name}</span>
            <button onClick={handleLogout} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Sign out</button>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

          <div style={{
            background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
            padding: '14px 20px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CLUB_TYPES.map(({ key, label }) => (
                <button key={key} onClick={() => setClubType(key)} style={{
                  padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  border: 'none',
                  background: clubType === key ? GREEN : '#f0f4f0',
                  color: clubType === key ? '#fff' : '#444',
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center' }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search model name…"
                style={{ ...inputStyle, width: 220 }}
              />
              <button onClick={() => { setForm({ ...EMPTY_FORM, club_type: clubType }); setSaveError(''); setShowAdd(true); }} style={{
                padding: '8px 16px', borderRadius: 6, border: 'none',
                background: GREEN, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              }}>+ Add Model</button>
            </div>
          </div>

          {clubType !== 'irons' && (
            <div style={{
              background: '#fef3e2', color: '#8a5a00', borderRadius: 8,
              padding: '10px 14px', fontSize: 13, marginBottom: 16,
            }}>
              Only Irons (sets) has been migrated from the Excel workbook so far — the other club types are empty until they're migrated too. You can still add new models here.
            </div>
          )}

          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>Loading…</div>
            ) : error ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#c0392b', fontSize: 13 }}>{error}</div>
            ) : models.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>No models found.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f0f4f0' }}>
                    <th style={thStyle}>Brand</th>
                    <th style={thStyle}>Model</th>
                    <th style={thStyle}>Year</th>
                    <th style={thStyle}>Loft</th>
                    <th style={thStyle}>Mens Length</th>
                    <th style={thStyle}>Ladies Length</th>
                    <th style={thStyle}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {models.flatMap(m => {
                    const variants = m.spec_variants?.length ? m.spec_variants : [{}];
                    return variants.map((v, i) => (
                      <tr key={`${m.id}-${v.id || i}`} style={{ borderTop: '1px solid #eee' }}>
                        {i === 0 && <td style={tdStyle} rowSpan={variants.length}>{m.brand || '—'}</td>}
                        {i === 0 && <td style={tdStyle} rowSpan={variants.length}>{m.model_name}</td>}
                        {i === 0 && <td style={tdStyle} rowSpan={variants.length}>{m.year || '—'}</td>}
                        <td style={tdStyle}>{v.loft || '—'}</td>
                        <td style={tdStyle}>{v.mens_length || '—'}</td>
                        <td style={tdStyle}>{v.womens_length || '—'}</td>
                        <td style={{ ...tdStyle, color: '#888' }}>{v.notes || ''}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 10 }}>{models.length} model{models.length === 1 ? '' : 's'}</div>
        </div>

        {showAdd && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
          }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: '28px 28px',
              width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
            }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>Add Model</h2>
              <form onSubmit={handleAddModel}>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Club Type</label>
                  <select value={form.club_type} onChange={e => setForm(f => ({ ...f, club_type: e.target.value }))} style={inputStyle}>
                    {CLUB_TYPES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Brand</label>
                    <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Titleist" style={inputStyle} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={labelStyle}>Model Name</label>
                    <input required value={form.model_name} onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))} placeholder="TSR3 Driver" style={inputStyle} />
                  </div>
                  <div style={{ width: 90 }}>
                    <label style={labelStyle}>Year</label>
                    <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} placeholder="2026" style={inputStyle} />
                  </div>
                </div>

                <label style={labelStyle}>{needsMultipleVariants ? 'Loft Variants' : 'Length'}</label>
                {form.variants.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
                    {needsMultipleVariants && (
                      <div style={{ width: 90 }}>
                        <input value={v.loft} onChange={e => updateVariant(i, 'loft', e.target.value)} placeholder="Loft" style={inputStyle} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <input value={v.mens_length} onChange={e => updateVariant(i, 'mens_length', e.target.value)} placeholder="Mens length" style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input value={v.womens_length} onChange={e => updateVariant(i, 'womens_length', e.target.value)} placeholder="Ladies length" style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input value={v.notes} onChange={e => updateVariant(i, 'notes', e.target.value)} placeholder="Notes" style={inputStyle} />
                    </div>
                    {form.variants.length > 1 && (
                      <button type="button" onClick={() => removeVariantRow(i)} style={{
                        border: 'none', background: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 16, padding: '0 4px',
                      }}>×</button>
                    )}
                  </div>
                ))}
                {needsMultipleVariants && (
                  <button type="button" onClick={addVariantRow} style={{
                    border: 'none', background: 'none', color: GREEN, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 14,
                  }}>+ Add another loft</button>
                )}

                {saveError && <p style={{ color: '#c0392b', fontSize: 13, margin: '10px 0' }}>{saveError}</p>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button type="button" onClick={() => setShowAdd(false)} style={{
                    padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                    background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>Cancel</button>
                  <button type="submit" disabled={saving} style={{
                    padding: '8px 18px', borderRadius: 6, border: 'none',
                    background: saving ? '#aaa' : GREEN, color: '#fff',
                    cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700,
                  }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const thStyle = {
  textAlign: 'left', padding: '9px 12px', fontWeight: 700, fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '0.04em', color: '#555',
};
const tdStyle = {
  padding: '9px 12px', fontSize: 13, color: '#222', verticalAlign: 'top',
};

export async function getServerSideProps({ req, res }) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return { redirect: { destination: '/login', permanent: false } };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile?.specs_guide_beta) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  return { props: { profile } };
}
