import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createServerSupabaseClient } from '../lib/supabaseServer';
import { createAdminClient } from '../lib/supabaseAdmin';
import { createClient } from '../lib/supabaseClient';

const GREEN = '#005F2C';
const LOCATIONS = ['All Locations', 'Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'];
const CHECKLIST = ['metafields', 'title', 'price', 'photographs', 'specifications', 'serial_id_checked', 'condition'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function downloadCSV(filename, headers, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Admin({ profile }) {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate] = useState(today());
  const [location, setLocation] = useState('All Locations');
  const [listings, setListings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', full_name: '', location: 'Edinburgh', role: 'employee' });
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const weekStart = getWeekStart();

    const [{ data: allListings }, { data: allEmployees }] = await Promise.all([
      supabase
        .from('listings')
        .select('*, profiles(full_name, location)')
        .gte('date', weekStart)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name'),
    ]);

    setListings(allListings || []);
    setEmployees(allEmployees || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleResetPassword(e) {
    e.preventDefault();
    setResetError('');
    if (resetPassword.length < 8) { setResetError('Password must be at least 8 characters.'); return; }
    setResetSaving(true);
    const { data: { session: sess } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.access_token}` },
      body: JSON.stringify({ userId: resetTarget.id, password: resetPassword }),
    });
    const data = await res.json();
    setResetSaving(false);
    if (!res.ok) { setResetError(data.error || 'Failed to reset password.'); return; }
    setResetTarget(null);
    setResetPassword('');
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    const { data: { session: sess } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sess?.access_token}`,
      },
      body: JSON.stringify(newUser),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreateError(data.error || 'Failed to create user.');
      setCreating(false);
      return;
    }
    setCreateSuccess(`${newUser.full_name} created successfully.`);
    setNewUser({ email: '', password: '', full_name: '', location: 'Edinburgh', role: 'employee' });
    setCreating(false);
    loadData();
    setTimeout(() => { setCreateSuccess(''); setShowCreate(false); }, 2000);
  }

  function exportOverview() {
    const headers = ['Employee', 'Location', 'Date', 'Listings', 'Complete', 'Incomplete'];
    const rows = employeeSummary.map(({ emp, count, complete }) => [
      emp.full_name, emp.location, date, count, complete, count - complete,
    ]);
    downloadCSV(`gc4c-overview-${date}.csv`, headers, rows);
  }

  function exportListings() {
    const headers = ['Time', 'Employee', 'Location', 'Serial ID', 'Metafields', 'Title', 'Price', 'Photographs', 'Specifications', 'Serial ID Check', 'Condition', 'Comments'];
    const rows = filteredListings.map(l => [
      formatTime(l.created_at),
      l.profiles?.full_name,
      l.profiles?.location,
      l.serial_id,
      l.metafields ? 'Yes' : 'No',
      l.title ? 'Yes' : 'No',
      l.price ? 'Yes' : 'No',
      l.photographs ? 'Yes' : 'No',
      l.specifications ? 'Yes' : 'No',
      l.serial_id_checked ? 'Yes' : 'No',
      l.condition ? 'Yes' : 'No',
      l.photos_comments || '',
    ]);
    downloadCSV(`gc4c-listings-${date}${location !== 'All Locations' ? '-' + location.replace(' ', '-') : ''}.csv`, headers, rows);
  }

  // Filtered listings for selected date + location
  const filteredListings = listings.filter(l => {
    if (l.date !== date) return false;
    if (location !== 'All Locations' && l.profiles?.location !== location) return false;
    return true;
  });

  // Location summary cards (today vs this week)
  const locationSummary = ['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'].map(loc => {
    const todayCount = listings.filter(l => l.date === today() && l.profiles?.location === loc).length;
    const weekCount = listings.filter(l => l.profiles?.location === loc).length;
    return { loc, todayCount, weekCount };
  });

  // Employee summary for selected date
  const employeeSummary = employees.map(emp => {
    const empListings = filteredListings.filter(l => l.user_id === emp.id);
    const complete = empListings.filter(l => CHECKLIST.every(c => l[c])).length;
    return { emp, count: empListings.length, complete };
  }).filter(e => location === 'All Locations' || e.emp.location === location);

  return (
    <>
      <Head><title>GC4C Listings — Manager</title></Head>
      <div style={{ minHeight: '100vh', background: '#f4f6f4' }}>

        {/* Top bar */}
        <div style={{
          background: GREEN, color: '#fff', padding: '0 24px', height: 52,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.05em' }}>GC4C Listings</span>
            <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
              Manager
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <button onClick={() => router.push('/my-listings')} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>My Listings</button>
            <button onClick={() => setShowCreate(true)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>+ Add Employee</button>
            <span style={{ opacity: 0.85 }}>{profile.full_name}</span>
            <button onClick={handleLogout} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Sign out</button>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

          {/* Location cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {locationSummary.map(({ loc, todayCount, weekCount }) => (
              <div key={loc} style={{
                background: '#fff', borderRadius: 10, padding: '14px 16px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                borderTop: `3px solid ${GREEN}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: 10 }}>{loc}</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{todayCount}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Today</div>
                  </div>
                  <div style={{ width: 1, background: '#eee' }} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#1a1a1a', lineHeight: 1 }}>{weekCount}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>This Week</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Filters + tabs */}
          <div style={{
            background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
            padding: '14px 20px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['overview', 'listings'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  border: 'none',
                  background: activeTab === tab ? GREEN : '#f0f4f0',
                  color: activeTab === tab ? '#fff' : '#444',
                }}>
                  {tab === 'overview' ? 'Employee Overview' : 'All Listings'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, marginLeft: 'auto', alignItems: 'center' }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  style={{ ...inputStyle, width: 150 }} />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <select value={location} onChange={e => setLocation(e.target.value)} style={{ ...inputStyle, width: 170 }}>
                  {LOCATIONS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#999', padding: 20, textAlign: 'center' }}>Loading…</p>
          ) : activeTab === 'overview' ? (

            /* Employee overview table */
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={exportOverview} style={exportBtnStyle}>↓ Export CSV</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f0f4f0' }}>
                    {['Employee', 'Location', 'Listings', 'Complete', 'Incomplete', ''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeeSummary.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#999' }}>No employees found.</td></tr>
                  ) : employeeSummary.map(({ emp, count, complete }, i) => (
                    <tr key={emp.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{emp.full_name}</td>
                      <td style={tdStyle}>{emp.location}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, fontSize: 15 }}>
                        <span style={{ color: GREEN }}>{count}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: '#28a745', fontWeight: 600 }}>{complete}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: count - complete > 0 ? '#e67e22' : '#999', fontWeight: 600 }}>
                          {count - complete}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => { setResetTarget(emp); setResetPassword(''); setResetError(''); }} style={{
                          background: 'none', border: '1px solid #ddd', borderRadius: 5,
                          padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#666', whiteSpace: 'nowrap',
                        }}>Reset pwd</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {employeeSummary.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f0f4f0', fontWeight: 700 }}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>TOTAL</td>
                      <td style={tdStyle}></td>
                      <td style={{ ...tdStyle, fontSize: 15, color: GREEN }}>{employeeSummary.reduce((s, e) => s + e.count, 0)}</td>
                      <td style={{ ...tdStyle, color: '#28a745' }}>{employeeSummary.reduce((s, e) => s + e.complete, 0)}</td>
                      <td style={tdStyle}>{employeeSummary.reduce((s, e) => s + (e.count - e.complete), 0)}</td>
                      <td style={tdStyle}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

          ) : (

            /* All listings table */
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {filteredListings.length} listing{filteredListings.length !== 1 ? 's' : ''}
                  {location !== 'All Locations' ? ` — ${location}` : ''} on {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <button onClick={exportListings} style={exportBtnStyle}>↓ Export CSV</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f0f4f0' }}>
                      {['Time', 'Employee', 'Location', 'Serial ID', 'Metafields', 'Title', 'Price', 'Photos', 'Specs', 'Serial ✓', 'Condition', 'Comments'].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredListings.length === 0 ? (
                      <tr><td colSpan={11} style={{ padding: 20, textAlign: 'center', color: '#999' }}>No listings for this date / location.</td></tr>
                    ) : filteredListings.map((l, i) => (
                      <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                        <td style={tdStyle}>{formatTime(l.created_at)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{l.profiles?.full_name}</td>
                        <td style={tdStyle}>{l.profiles?.location}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{l.serial_id}</td>
                        {CHECKLIST.map(c => (
                          <td key={c} style={{ ...tdStyle, textAlign: 'center' }}>
                            {l[c]
                              ? <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>
                              : <span style={{ color: '#ddd' }}>–</span>}
                          </td>
                        ))}
                        <td style={{ ...tdStyle, color: '#666', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.photos_comments || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create employee modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '28px 28px',
            width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20 }}>Add Employee</h2>
            <form onSubmit={handleCreateUser}>
              {[
                { key: 'full_name', label: 'Full Name', type: 'text', placeholder: 'Jane Smith' },
                { key: 'email', label: 'Email', type: 'email', placeholder: 'jane@golfclubs4cash.co.uk' },
                { key: 'password', label: 'Temporary Password', type: 'password', placeholder: 'Min 8 characters' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} required value={newUser[key]}
                    onChange={e => setNewUser(u => ({ ...u, [key]: e.target.value }))}
                    placeholder={placeholder} style={inputStyle} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Location</label>
                  <select value={newUser.location} onChange={e => setNewUser(u => ({ ...u, location: e.target.value }))} style={inputStyle}>
                    {['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Role</label>
                  <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} style={inputStyle}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>
              {createError && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{createError}</p>}
              {createSuccess && <p style={{ color: '#155724', fontSize: 13, marginBottom: 10 }}>{createSuccess}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>Cancel</button>
                <button type="submit" disabled={creating} style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: creating ? '#aaa' : GREEN, color: '#fff',
                  cursor: creating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700,
                }}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => e.target === e.currentTarget && setResetTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 28px', width: '100%', maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Reset Password</h2>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>{resetTarget.full_name}</p>
            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>New Password</label>
                <input type="password" required value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder="Min 8 characters" style={inputStyle} />
              </div>
              {resetError && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{resetError}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setResetTarget(null)} style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>Cancel</button>
                <button type="submit" disabled={resetSaving} style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: resetSaving ? '#aaa' : GREEN, color: '#fff',
                  cursor: resetSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700,
                }}>{resetSaving ? 'Saving…' : 'Reset Password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#555',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em',
};
const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1px solid #d0d0d0',
  borderRadius: 6, fontSize: 13, outline: 'none', background: '#fafafa',
};
const thStyle = {
  textAlign: 'left', padding: '9px 12px', fontWeight: 700, fontSize: 11,
  color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
};
const tdStyle = { padding: '8px 12px', verticalAlign: 'middle' };
const exportBtnStyle = {
  background: '#f0f4f0', border: '1px solid #d0d0d0', borderRadius: 6,
  padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#333',
  whiteSpace: 'nowrap',
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

  if (!profile || profile.role !== 'manager') {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  return { props: { profile } };
}
