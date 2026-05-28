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
  { key: 'serial_id_checked', label: 'Serial ID' },
  { key: 'condition', label: 'Condition' },
];

const DIFFICULTY = [
  { key: 'easy',   label: 'Easy',   color: '#28a745', bg: '#d4edda' },
  { key: 'medium', label: 'Medium', color: '#e67e22', bg: '#fef3e2' },
  { key: 'hard',   label: 'Hard',   color: '#c0392b', bg: '#fde8e8' },
];

const EMPTY_FORM = {
  serial_id: '',
  metafields: false,
  title: false,
  price: false,
  photographs: false,
  specifications: false,
  serial_id_checked: false,
  condition: false,
};

const EMPTY_BATCH = { difficulty: '', comments: '' };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function DiffBadge({ difficulty }) {
  const d = DIFFICULTY.find(x => x.key === difficulty);
  if (!d) return null;
  return (
    <span style={{
      background: d.bg, color: d.color, fontWeight: 700, fontSize: 11,
      padding: '2px 9px', borderRadius: 20, border: `1px solid ${d.color}`,
      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{d.label}</span>
  );
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
          <a href="/login" style={{ color: GREEN, fontWeight: 700 }}>Back to login</a>
        </div>
      </div>
    );
  }

  const router = useRouter();
  const supabase = createClient();

  const [view, setView] = useState('history');
  const [batches, setBatches] = useState([]);
  const [activeBatch, setActiveBatch] = useState(null);
  const [batchListings, setBatchListings] = useState([]);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchForm, setBatchForm] = useState(EMPTY_BATCH);
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchError, setBatchError] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [listedAt, setListedAt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [statsToday, setStatsToday] = useState(0);
  const [statsWeek, setStatsWeek] = useState(0);

  const [historyListings, setHistoryListings] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('day');
  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showChangePw, setShowChangePw] = useState(false);
  const [pwForm, setPwForm] = useState({ newPassword: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [noteViewTarget, setNoteViewTarget] = useState(null);
  const [unresolvedNotesCount, setUnresolvedNotesCount] = useState(0);

  const loadStats = useCallback(async () => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const weekStart = d.toISOString().slice(0, 10);
    const [{ count: tc }, { count: wc }, { count: nc }] = await Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('date', today()),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).gte('date', weekStart),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).not('manager_note', 'is', null).eq('note_resolved', false),
    ]);
    setStatsToday(tc || 0);
    setStatsWeek(wc || 0);
    setUnresolvedNotesCount(nc || 0);
  }, [profile.id]);

  const loadBatches = useCallback(async () => {
    const { data } = await supabase
      .from('batches')
      .select('*')
      .eq('user_id', profile.id)
      .eq('date', today())
      .order('created_at', { ascending: false });
    setBatches(data || []);
  }, [profile.id]);

  const loadBatchListings = useCallback(async (batchId) => {
    const { data } = await supabase
      .from('listings')
      .select('*')
      .eq('batch_id', batchId)
      .order('created_at', { ascending: false });
    setBatchListings(data || []);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const now = new Date();
    let from = null;
    if (historyFilter === 'day') {
      from = today();
    } else if (historyFilter === 'week') {
      const d = new Date();
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      from = d.toISOString().slice(0, 10);
    } else if (historyFilter === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    }
    let query = supabase
      .from('listings')
      .select('*, batches(difficulty, comments)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (from) query = query.gte('date', from);
    const { data } = await query;
    setHistoryListings(data || []);
    setHistoryLoading(false);
  }, [profile.id, historyFilter]);

  useEffect(() => { loadBatches(); loadStats(); }, [loadBatches, loadStats]);
  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  async function handleCreateBatch(e) {
    e.preventDefault();
    setBatchError('');
    if (!batchForm.difficulty) { setBatchError('Please select a difficulty.'); return; }
    setBatchCreating(true);

    const { data: batch, error: err } = await supabase.from('batches').insert({
      user_id: profile.id,
      date: today(),
      difficulty: batchForm.difficulty,
      comments: batchForm.comments.trim() || null,
    }).select().single();

    setBatchCreating(false);
    if (err) { setBatchError('Failed to create batch. Try again.'); return; }

    setBatchForm(EMPTY_BATCH);
    setShowBatchForm(false);
    setActiveBatch(batch);
    setBatchListings([]);
    setView('batch-detail');
    loadBatches();
  }

  async function handleListingSubmit(e) {
    e.preventDefault();
    if (!form.serial_id.trim()) { setError('Serial ID is required.'); return; }
    if (profile.mandatory_checklist && !CHECKLIST.every(c => form[c.key])) { setError('All checklist items must be ticked before submitting.'); return; }
    setError('');
    setSubmitting(true);
    const { error: err } = await supabase.from('listings').insert({
      user_id: profile.id,
      date: today(),
      batch_id: activeBatch.id,
      ...form,
      serial_id: form.serial_id.trim(),
    });
    if (err) { setError('Failed to save listing. Try again.'); setSubmitting(false); return; }
    setForm(EMPTY_FORM);
    setListedAt(null);
    setSubmitting(false);
    showSuccess('Listing saved!');
    loadBatchListings(activeBatch.id);
    loadStats();
  }

  async function handleDeleteListing(id) {
    if (!confirm('Remove this listing?')) return;
    await supabase.from('listings').delete().eq('id', id);
    loadBatchListings(activeBatch.id);
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (pwForm.newPassword !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    setPwSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password: pwForm.newPassword });
    setPwSaving(false);
    if (err) { setPwError(err.message); return; }
    setPwForm({ newPassword: '', confirm: '' });
    setShowChangePw(false);
    showSuccess('Password updated.');
  }

  async function handleEmployeeResolve(listingId) {
    await supabase.from('listings').update({ note_resolved: true }).eq('id', listingId);
    setNoteViewTarget(null);
    loadHistory();
    loadStats();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function showSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 2500);
  }

  const filteredHistory = historyListings.filter(l =>
    !historySearch || l.serial_id.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <>
      <Head><title>GC4C Listings — Dashboard</title></Head>
      <div style={{ minHeight: '100vh', background: '#f4f6f4' }}>

        {/* Top bar */}
        <div style={{ background: GREEN, color: '#fff', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.05em' }}>GC4C Listings</span>
            <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
              {profile.location}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13 }}>
            <span style={{ opacity: 0.85 }}>{profile.full_name}</span>
            <button onClick={() => setShowChangePw(true)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Change Password</button>
            <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Sign out</button>
          </div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px' }}>

          {successMsg && (
            <div style={{ background: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', borderRadius: 7, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
              {successMsg}
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderTop: `3px solid ${GREEN}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Today</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{statsToday}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>listings</div>
            </div>
            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 20px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', borderTop: '3px solid #bbb' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>This Week</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: '#1a1a1a', lineHeight: 1 }}>{statsWeek}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>listings</div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setView('history')} style={{
              padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: view === 'history' ? GREEN : '#e8eee8',
              color: view === 'history' ? '#fff' : '#444',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              My Listings
              {unresolvedNotesCount > 0 && (
                <span style={{
                  background: view === 'history' ? '#fff' : '#e67e22',
                  color: view === 'history' ? '#e67e22' : '#fff',
                  borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 800,
                }}>
                  {unresolvedNotesCount}
                </span>
              )}
            </button>
            <button onClick={() => { setView('batches'); setActiveBatch(null); }} style={{
              padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: view !== 'history' ? GREEN : '#e8eee8',
              color: view !== 'history' ? '#fff' : '#444',
            }}>+ Add Listings</button>
          </div>

          {/* ── BATCHES LIST ── */}
          {view === 'batches' && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={cardTitleStyle}>
                  Today's Batches
                  <span style={{ marginLeft: 10, background: GREEN, color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>
                    {batches.length}
                  </span>
                </h2>
                <button onClick={() => { setBatchForm(EMPTY_BATCH); setBatchError(''); setShowBatchForm(true); }} style={btnStyle}>
                  + New Batch
                </button>
              </div>
              {batches.length === 0 ? (
                <p style={{ color: '#999', fontSize: 13 }}>No batches started today. Hit "+ New Batch" to begin.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {batches.map(batch => (
                    <button key={batch.id} onClick={() => { setActiveBatch(batch); loadBatchListings(batch.id); setView('batch-detail'); }} style={{
                      background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: 8,
                      padding: '12px 16px', cursor: 'pointer', textAlign: 'left', width: '100%',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <DiffBadge difficulty={batch.difficulty} />
                      <span style={{ fontSize: 13, color: '#555', flex: 1 }}>
                        {batch.comments || <em style={{ color: '#bbb' }}>No comments</em>}
                      </span>
                      <span style={{ fontSize: 12, color: '#bbb' }}>{formatTime(batch.created_at)}</span>
                      <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>Open →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── BATCH DETAIL ── */}
          {view === 'batch-detail' && activeBatch && (
            <>
              <div style={{ ...cardStyle, borderLeft: `4px solid ${DIFFICULTY.find(d => d.key === activeBatch.difficulty)?.color || GREEN}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => { setView('batches'); setActiveBatch(null); setForm(EMPTY_FORM); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 13, padding: 0, fontWeight: 600 }}>← Batches</button>
                  <DiffBadge difficulty={activeBatch.difficulty} />
                  {activeBatch.comments && <span style={{ fontSize: 13, color: '#555' }}>{activeBatch.comments}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#555' }}>
                    {batchListings.length} listing{batchListings.length !== 1 ? 's' : ''} in this batch
                  </span>
                </div>
              </div>

              <div style={cardStyle}>
                <h2 style={cardTitleStyle}>Add Listing</h2>
                <form onSubmit={handleListingSubmit}>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
                    <div style={{ flex: '0 0 180px' }}>
                      <label style={labelStyle}>Serial ID *</label>
                      <input
                        type="text"
                        value={form.serial_id}
                        onChange={e => {
                          const val = e.target.value;
                          setForm(f => ({ ...f, serial_id: val }));
                          if (val && !form.serial_id) setListedAt(new Date());
                          if (!val) setListedAt(null);
                        }}
                        style={inputStyle}
                        placeholder="e.g. GC-12345"
                        autoFocus
                      />
                    </div>
                    {listedAt && (
                      <div style={{ flex: '0 0 auto' }}>
                        <label style={labelStyle}>Date / Time</label>
                        <input readOnly
                          value={`${listedAt.toLocaleDateString('en-GB')}  ${listedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                          style={{ ...inputStyle, width: 160, background: '#f0f7f0', color: '#444', cursor: 'default' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label style={labelStyle}>Checklist</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                      {CHECKLIST.map(({ key, label }) => (
                        <label key={key} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: form[key] ? '#e8f5ee' : '#f5f5f5',
                          border: `1.5px solid ${form[key] ? GREEN : '#d0d0d0'}`,
                          borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
                          fontSize: 13, fontWeight: 600, userSelect: 'none', transition: 'all 0.1s',
                        }}>
                          <input type="checkbox" checked={form[key]}
                            onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                            style={{ accentColor: GREEN, width: 15, height: 15 }} />
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

              <div style={cardStyle}>
                <h2 style={{ ...cardTitleStyle, marginBottom: 14 }}>Listings in this Batch</h2>
                {batchListings.length === 0 ? (
                  <p style={{ color: '#999', fontSize: 13 }}>No listings added yet.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f0f4f0' }}>
                          <th style={thStyle}>Time</th>
                          <th style={thStyle}>Serial ID</th>
                          {CHECKLIST.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
                          <th style={thStyle}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchListings.map((l, i) => (
                          <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                            <td style={tdStyle}>{formatTime(l.created_at)}</td>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>{l.serial_id}</td>
                            {CHECKLIST.map(c => (
                              <td key={c.key} style={{ ...tdStyle, textAlign: 'center' }}>
                                {l[c.key] ? <span style={{ color: GREEN, fontWeight: 700, fontSize: 15 }}>✓</span> : <span style={{ color: '#ccc' }}>–</span>}
                              </td>
                            ))}
                            <td style={tdStyle}>
                              <button onClick={() => handleDeleteListing(l.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 4px' }} title="Remove">×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── HISTORY ── */}
          {view === 'history' && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { key: 'day', label: 'Today' },
                    { key: 'week', label: 'This Week' },
                    { key: 'month', label: 'This Month' },
                    { key: 'all', label: 'All Time' },
                  ].map(f => (
                    <button key={f.key} onClick={() => setHistoryFilter(f.key)} style={{
                      padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                      background: historyFilter === f.key ? GREEN : '#f0f4f0',
                      color: historyFilter === f.key ? '#fff' : '#444',
                    }}>{f.label}</button>
                  ))}
                </div>
                <input type="text" placeholder="Search Serial ID…" value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  style={{ ...inputStyle, width: 180 }} />
                <span style={{ fontSize: 13, color: '#888' }}>
                  {filteredHistory.length} listing{filteredHistory.length !== 1 ? 's' : ''}
                </span>
              </div>

              {historyLoading ? (
                <p style={{ color: '#999', fontSize: 13, textAlign: 'center', padding: 20 }}>Loading…</p>
              ) : filteredHistory.length === 0 ? (
                <p style={{ color: '#999', fontSize: 13 }}>No listings found.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f0f4f0' }}>
                        <th style={thStyle}>Date</th>
                        <th style={thStyle}>Time</th>
                        <th style={thStyle}>Serial ID</th>
                        <th style={thStyle}>Batch</th>
                        <th style={thStyle}>Photos / Batch</th>
                        {CHECKLIST.map(c => <th key={c.key} style={thStyle}>{c.label}</th>)}
                        <th style={thStyle}>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((l, i) => {
                        const hasNote = l.manager_note && !l.note_resolved;
                        const rowBg = hasNote
                          ? (l.note_priority ? '#fffbf0' : '#fffff4')
                          : (i % 2 === 0 ? '#fff' : '#fafafa');
                        return (
                          <tr key={l.id} style={{ background: rowBg, borderBottom: '1px solid #eee', borderLeft: hasNote ? `3px solid ${l.note_priority ? '#e67e22' : '#ffc107'}` : '3px solid transparent' }}>
                            <td style={tdStyle}>{new Date(l.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                            <td style={tdStyle}>{formatTime(l.created_at)}</td>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>{l.serial_id}</td>
                            <td style={tdStyle}>{l.batches ? <DiffBadge difficulty={l.batches.difficulty} /> : '—'}</td>
                            <td style={{ ...tdStyle, color: '#555', fontSize: 12 }}>{l.batches?.comments || '—'}</td>
                            {CHECKLIST.map(c => (
                              <td key={c.key} style={{ ...tdStyle, textAlign: 'center' }}>
                                {l[c.key] ? <span style={{ color: GREEN, fontWeight: 700, fontSize: 15 }}>✓</span> : <span style={{ color: '#ccc' }}>–</span>}
                              </td>
                            ))}
                            <td style={tdStyle}>
                              {l.manager_note ? (
                                <button onClick={() => setNoteViewTarget(l)} style={{
                                  background: l.note_resolved ? '#f0f0f0' : l.note_priority ? '#fff3cd' : '#fff8e1',
                                  border: `1px solid ${l.note_resolved ? '#ddd' : l.note_priority ? '#ffc107' : '#ffe082'}`,
                                  borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                                  fontWeight: 700, color: l.note_resolved ? '#aaa' : l.note_priority ? '#856404' : '#795548',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {l.note_resolved ? '✓ Done' : l.note_priority ? '⚑ Note' : '! Note'}
                                </button>
                              ) : <span style={{ color: '#ddd' }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* New batch modal */}
      {showBatchForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setShowBatchForm(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>Start New Batch</h2>
            <form onSubmit={handleCreateBatch}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Difficulty *</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  {DIFFICULTY.map(d => (
                    <button key={d.key} type="button" onClick={() => setBatchForm(f => ({ ...f, difficulty: d.key }))} style={{
                      flex: 1, padding: '10px 0', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                      border: `2px solid ${batchForm.difficulty === d.key ? d.color : '#e0e0e0'}`,
                      background: batchForm.difficulty === d.key ? d.bg : '#fff',
                      color: batchForm.difficulty === d.key ? d.color : '#888',
                      transition: 'all 0.1s',
                    }}>{d.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Photos / Batch</label>
                <textarea value={batchForm.comments} onChange={e => setBatchForm(f => ({ ...f, comments: e.target.value }))}
                  rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                  placeholder="e.g. 27/05 Batch 1 M5" />
              </div>
              {batchError && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{batchError}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowBatchForm(false)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={batchCreating} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: batchCreating ? '#aaa' : GREEN, color: '#fff', cursor: batchCreating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {batchCreating ? 'Creating…' : 'Start Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manager note view modal (employee) */}
      {noteViewTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setNoteViewTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Manager Note</h2>
              {noteViewTarget.note_priority && (
                <span style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#856404' }}>Priority</span>
              )}
              {noteViewTarget.note_resolved && (
                <span style={{ background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#888' }}>Resolved</span>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>{noteViewTarget.serial_id}</p>
            <div style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#333', lineHeight: 1.6, marginBottom: 18 }}>
              {noteViewTarget.manager_note}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setNoteViewTarget(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Close</button>
              {!noteViewTarget.note_resolved && (
                <button onClick={() => handleEmployeeResolve(noteViewTarget.id)} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: GREEN, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  ✓ Mark as Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {showChangePw && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setShowChangePw(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px', width: '100%', maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>Change Password</h2>
            <form onSubmit={handleChangePassword}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>New Password</label>
                <input type="password" required value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min 8 characters" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Confirm Password</label>
                <input type="password" required value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat new password" style={inputStyle} />
              </div>
              {pwError && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{pwError}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowChangePw(false); setPwError(''); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={pwSaving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: pwSaving ? '#aaa' : GREEN, color: '#fff', cursor: pwSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {pwSaving ? 'Saving…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const cardStyle = { background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '18px 20px', marginBottom: 16 };
const cardTitleStyle = { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 0 };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d0d0d0', borderRadius: 6, fontSize: 14, outline: 'none', background: '#fafafa' };
const btnStyle = { background: GREEN, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', letterSpacing: '0.03em' };
const thStyle = { textAlign: 'left', padding: '8px 10px', fontWeight: 700, fontSize: 12, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 10px', verticalAlign: 'middle' };

export async function getServerSideProps({ req, res }) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { redirect: { destination: '/login', permanent: false } };

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles').select('*').eq('id', session.user.id).single();

  if (profile?.role === 'manager') return { redirect: { destination: '/admin', permanent: false } };

  return {
    props: {
      profile: profile || null,
      _debug: { userId: session.user.id, profileError: profileError?.message || null, hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    },
  };
}
