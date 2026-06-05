import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { createServerSupabaseClient } from '../lib/supabaseServer';
import { createAdminClient } from '../lib/supabaseAdmin';
import { createClient } from '../lib/supabaseClient';

const GREEN = '#005F2C';

const DIFFICULTY = [
  { key: 'easy',   label: 'Easy',   color: '#28a745', bg: '#d4edda' },
  { key: 'medium', label: 'Medium', color: '#e67e22', bg: '#fef3e2' },
  { key: 'hard',   label: 'Hard',   color: '#c0392b', bg: '#fde8e8' },
];

function DiffBadge({ difficulty }) {
  const d = DIFFICULTY.find(x => x.key === difficulty);
  if (!d) return <span style={{ color: '#ccc', fontSize: 11 }}>—</span>;
  return (
    <span style={{
      background: d.bg, color: d.color, fontWeight: 700, fontSize: 11,
      padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
    }}>{d.label}</span>
  );
}

const LOCATIONS = ['All Locations', 'Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton', 'Returns'];
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

function formatValue(v) {
  if (!v) return '£0';
  return `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default function Admin({ profile, isReadOnly }) {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate] = useState(today());
  const [location, setLocation] = useState('All Locations');
  const [listings, setListings] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewPeriod, setOverviewPeriod] = useState('day');
  const [overviewFrom, setOverviewFrom] = useState(today());
  const [overviewTo, setOverviewTo] = useState(today());
  const [listingsPeriod, setListingsPeriod] = useState('week');
  const [listingsEmployee, setListingsEmployee] = useState('');
  const [listingsSearch, setListingsSearch] = useState('');

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
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [notePriority, setNotePriority] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [notesFilter, setNotesFilter] = useState('open');
  const [notesPeriod, setNotesPeriod] = useState('all');
  const [notesEmployee, setNotesEmployee] = useState('');
  const [notesSearch, setNotesSearch] = useState('');
  const [notes, setNotes] = useState([]);
  const [empDetail, setEmpDetail] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [listingsPage, setListingsPage] = useState(1);
  const scrollRef = useRef(null);
  const topScrollRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const weekStart = getWeekStart();
    const d = new Date();
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
    let fromDate = weekStart;
    if (listingsPeriod === 'month' || overviewPeriod === 'month') {
      fromDate = monthStart;
    }
    if (overviewPeriod === 'custom' && overviewFrom < fromDate) {
      fromDate = overviewFrom;
    }
    if (overviewPeriod === 'day' && date < fromDate) {
      fromDate = date;
    }
    if (listingsPeriod === 'all') {
      fromDate = null;
    }
    let q = supabase
      .from('listings')
      .select('*, profiles(full_name, location), batches(difficulty, comments, description, photo_urls)')
      .order('created_at', { ascending: false })
      .limit(500000);
    if (fromDate) q = q.gte('date', fromDate);

    const [{ data: allListings }, { data: allEmployees }, { data: allNotes }] = await Promise.all([
      q,
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('listings')
        .select('*, profiles(full_name, location)')
        .not('manager_note', 'is', null)
        .order('note_priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10000),
    ]);

    setListings(allListings || []);
    setEmployees(allEmployees || []);
    setNotes(allNotes || []);
    setLoading(false);
  }, [listingsPeriod, overviewPeriod, overviewFrom, overviewTo, date]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleToggleChecklist(emp) {
    const { data: { session: sess } } = await supabase.auth.getSession();
    await fetch('/api/admin/toggle-checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.access_token}` },
      body: JSON.stringify({ userId: emp.id, mandatory_checklist: !emp.mandatory_checklist }),
    });
    loadData();
  }

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

  async function handleSaveNote(e) {
    e.preventDefault();
    setNoteSaving(true);
    await supabase.from('listings').update({
      manager_note: noteText.trim() || null,
      note_priority: notePriority,
      note_resolved: false,
    }).eq('id', noteTarget.id);
    setNoteSaving(false);
    setNoteTarget(null);
    setNoteText('');
    setNotePriority(false);
    loadData();
  }

  async function handleManagerResolve(listingId, resolved) {
    await supabase.from('listings').update({ note_resolved: resolved }).eq('id', listingId);
    loadData();
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    await supabase.from('listings').update({
      serial_id: editForm.serial_id.trim(),
      metafields: editForm.metafields,
      title: editForm.title,
      price: editForm.price,
      photographs: editForm.photographs,
      specifications: editForm.specifications,
      serial_id_checked: editForm.serial_id_checked,
      condition: editForm.condition,
    }).eq('id', editTarget.id);
    setEditSaving(false);
    setEditTarget(null);
    loadData();
  }

  useEffect(() => { setListingsPage(1); }, [listingsPeriod, listingsEmployee, listingsSearch, location]);

  async function handleDeleteListing(id) {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    await supabase.from('listings').delete().eq('id', id);
    loadData();
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
    const headers = ['Employee', 'Location', 'Date', 'Listings', 'Complete'];
    const rows = employeeSummary.map(({ emp, count, complete }) => [
      emp.full_name, emp.location, date, count, complete,
    ]);
    downloadCSV(`gc4c-overview-${date}.csv`, headers, rows);
  }

  function exportListings() {
    const headers = ['Date', 'Time', 'Employee', 'Location', 'Serial ID', 'Metafields', 'Title', 'Price', 'Photographs', 'Specifications', 'Serial ID Check', 'Condition', 'Photos / Batch', 'Difficulty', 'Manager Note'];
    const rows = filteredListings.map(l => [
      l.date,
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
      [l.batches?.comments, l.batches?.description].filter(Boolean).join(' — '),
      l.batches?.difficulty || '',
      l.manager_note || '',
    ]);
    downloadCSV(`gc4c-listings-${listingsPeriod}-${today()}${location !== 'All Locations' ? '-' + location.replace(' ', '-') : ''}.csv`, headers, rows);
  }

  const todayStr = today();
  const weekStart = getWeekStart();
  const d2 = new Date();
  const monthStartStr = new Date(d2.getFullYear(), d2.getMonth(), 1).toISOString().slice(0, 10);

  // For All Listings tab — period + location + employee + search
  const filteredListings = listings.filter(l => {
    if (listingsPeriod === 'day' && l.date !== todayStr) return false;
    if (listingsPeriod === 'week' && l.date < weekStart) return false;
    if (location !== 'All Locations' && l.profiles?.location !== location) return false;
    if (listingsEmployee && l.user_id !== listingsEmployee) return false;
    if (listingsSearch && !l.serial_id.toLowerCase().includes(listingsSearch.toLowerCase())) return false;
    return true;
  });

  // For Employee Overview tab — period or exact date + location
  const overviewListings = listings.filter(l => {
    if (overviewPeriod === 'day' && l.date !== date) return false;
    if (overviewPeriod === 'week' && l.date < weekStart) return false;
    if (overviewPeriod === 'month' && l.date < monthStartStr) return false;
    if (overviewPeriod === 'custom' && (l.date < overviewFrom || l.date > overviewTo)) return false;
    if (location !== 'All Locations' && l.profiles?.location !== location) return false;
    return true;
  });

  const periodLabel = overviewPeriod === 'day' ? new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : overviewPeriod === 'week' ? 'This Week'
    : overviewPeriod === 'month' ? 'This Month'
    : 'Custom';

  // Location summary cards — driven by overviewListings so period + date selector both work
  const locationSummary = ['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'].map(loc => {
    const periodListings = overviewListings.filter(l => l.profiles?.location === loc);
    const weekListings = listings.filter(l => l.date >= weekStart && l.profiles?.location === loc);
    return {
      loc,
      todayCount: periodListings.length,
      todayValue: periodListings.reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
      weekCount: weekListings.length,
      weekValue: weekListings.reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
    };
  });

  // Returns summary (separate)
  const returnsWeekListings = listings.filter(l => l.date >= weekStart && l.profiles?.location === 'Returns');
  const returnsSummary = {
    todayCount: overviewListings.filter(l => l.profiles?.location === 'Returns').length,
    todayValue: overviewListings.filter(l => l.profiles?.location === 'Returns').reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
    weekCount: returnsWeekListings.length,
    weekValue: returnsWeekListings.reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
  };

  function buildEmpStats(emp) {
    const empListings = overviewListings.filter(l => l.user_id === emp.id);
    const complete = empListings.filter(l => CHECKLIST.every(c => l[c])).length;
    const batchMap = {};
    empListings.forEach(l => {
      if (l.batch_id && l.batches?.difficulty && !batchMap[l.batch_id]) batchMap[l.batch_id] = l.batches.difficulty;
    });
    const batches = { easy: 0, medium: 0, hard: 0 };
    Object.values(batchMap).forEach(d => { if (d in batches) batches[d]++; });
    const totalValue = empListings.reduce((s, l) => s + (Number(l.listing_value) || 0), 0);
    const times = empListings.map(l => new Date(l.created_at).getTime()).sort((a, b) => a - b);
    const hours = times.length > 1 ? (times[times.length - 1] - times[0]) / (1000 * 60 * 60) : 0;
    return { emp, count: empListings.length, complete, batches, totalValue };
  }

  // Main employee summary (excludes Returns)
  const employeeSummary = employees
    .filter(emp => emp.location !== 'Returns')
    .map(buildEmpStats)
    .filter(e => location === 'All Locations' || e.emp.location === location);

  // Returns employee summary (separate)
  const returnsEmployeeSummary = employees
    .filter(emp => emp.location === 'Returns')
    .map(buildEmpStats);

  const PAGE_SIZE = 10;
  const totalListingsPages = Math.ceil(filteredListings.length / PAGE_SIZE);
  const paginatedListings = filteredListings.slice((listingsPage - 1) * PAGE_SIZE, listingsPage * PAGE_SIZE);

  // Notes tab — filtered by open/resolved/all + period + location + employee + search
  const filteredNotes = notes.filter(l => {
    if (notesFilter === 'open' && l.note_resolved) return false;
    if (notesFilter === 'resolved' && !l.note_resolved) return false;
    if (notesPeriod === 'day' && l.date !== todayStr) return false;
    if (notesPeriod === 'week' && l.date < weekStart) return false;
    if (notesPeriod === 'month' && l.date < monthStartStr) return false;
    if (location !== 'All Locations' && l.profiles?.location !== location) return false;
    if (notesEmployee && l.user_id !== notesEmployee) return false;
    if (notesSearch && !l.serial_id.toLowerCase().includes(notesSearch.toLowerCase())) return false;
    return true;
  });

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
            {!isReadOnly && <button onClick={() => router.push('/my-listings')} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>My Listings</button>}
            {!isReadOnly && <button onClick={() => setShowCreate(true)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>+ Add Employee</button>}
            <button onClick={async () => {
              const { data: { session: sess } } = await supabase.auth.getSession();
              const res = await fetch('/api/admin/send-report', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${sess?.access_token}` },
              });
              const data = await res.json();
              alert(res.ok ? 'Report sent! Check your email.' : 'Failed: ' + JSON.stringify(data));
            }} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Send Test Report</button>
            <span style={{ opacity: 0.85 }}>{profile.full_name}</span>
            <button onClick={handleLogout} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>Sign out</button>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>

          {/* Location cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {locationSummary.map(({ loc, todayCount, todayValue, weekCount, weekValue }) => (
              <div key={loc} style={{
                background: '#fff', borderRadius: 10, padding: '14px 16px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
                borderTop: `3px solid ${GREEN}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: 10 }}>{loc}</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: GREEN, lineHeight: 1 }}>{todayCount}</div>
                    <div style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>{formatValue(todayValue)}</div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{periodLabel}</div>
                  </div>
                  <div style={{ width: 1, background: '#eee' }} />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#1a1a1a', lineHeight: 1 }}>{weekCount}</div>
                    <div style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>{formatValue(weekValue)}</div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>This Week</div>
                  </div>
                </div>
              </div>
            ))}
            <div style={{
              background: GREEN, borderRadius: 10, padding: '14px 16px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
              borderTop: `3px solid rgba(0,0,0,0.15)`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.75)', marginBottom: 10 }}>Business Total</div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                    {locationSummary.reduce((s, l) => s + l.todayCount, 0) + returnsSummary.todayCount}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{formatValue(locationSummary.reduce((s, l) => s + l.todayValue, 0) + returnsSummary.todayValue)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>{periodLabel}</div>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                    {locationSummary.reduce((s, l) => s + l.weekCount, 0) + returnsSummary.weekCount}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{formatValue(locationSummary.reduce((s, l) => s + l.weekValue, 0) + returnsSummary.weekValue)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>This Week</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters + tabs */}
          <div style={{
            background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
            padding: '14px 20px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { key: 'overview', label: 'Employee Overview' },
                { key: 'listings', label: 'All Listings' },
                { key: 'notes', label: `Notes${notes.filter(n => !n.note_resolved).length > 0 ? ` (${notes.filter(n => !n.note_resolved).length})` : ''}` },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)} style={{
                  padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  border: 'none',
                  background: activeTab === key ? GREEN : '#f0f4f0',
                  color: activeTab === key ? '#fff' : key === 'notes' && notes.filter(n => !n.note_resolved).length > 0 ? '#856404' : '#444',
                }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
              {activeTab === 'listings' || activeTab === 'notes' ? (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { key: 'day', label: 'Today' },
                      { key: 'week', label: 'This Week' },
                      { key: 'month', label: 'This Month' },
                      { key: 'all', label: 'All Time' },
                    ].map(p => {
                      const active = activeTab === 'listings' ? listingsPeriod : notesPeriod;
                      const setter = activeTab === 'listings' ? setListingsPeriod : setNotesPeriod;
                      return (
                        <button key={p.key} onClick={() => setter(p.key)} style={{
                          padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontWeight: 700, fontSize: 12,
                          background: active === p.key ? GREEN : '#f0f4f0',
                          color: active === p.key ? '#fff' : '#444',
                        }}>{p.label}</button>
                      );
                    })}
                  </div>
                  <select
                    value={activeTab === 'listings' ? listingsEmployee : notesEmployee}
                    onChange={e => activeTab === 'listings' ? setListingsEmployee(e.target.value) : setNotesEmployee(e.target.value)}
                    style={{ ...inputStyle, width: 160 }}>
                    <option value="">All Employees</option>
                    {employees.filter(e => location === 'All Locations' || e.location === location).map(e => (
                      <option key={e.id} value={e.id}>{e.full_name}</option>
                    ))}
                  </select>
                  <input type="text" placeholder="Search Serial ID…"
                    value={activeTab === 'listings' ? listingsSearch : notesSearch}
                    onChange={e => activeTab === 'listings' ? setListingsSearch(e.target.value) : setNotesSearch(e.target.value)}
                    style={{ ...inputStyle, width: 160 }} />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { key: 'day', label: 'Day' },
                      { key: 'week', label: 'This Week' },
                      { key: 'month', label: 'This Month' },
                      { key: 'custom', label: 'Custom' },
                    ].map(p => (
                      <button key={p.key} onClick={() => setOverviewPeriod(p.key)} style={{
                        padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontWeight: 700, fontSize: 12,
                        background: overviewPeriod === p.key ? GREEN : '#f0f4f0',
                        color: overviewPeriod === p.key ? '#fff' : '#444',
                      }}>{p.label}</button>
                    ))}
                  </div>
                  {overviewPeriod === 'day' && (
                    <div>
                      <label style={labelStyle}>Date</label>
                      <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        style={{ ...inputStyle, width: 150 }} />
                    </div>
                  )}
                  {overviewPeriod === 'custom' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div>
                        <label style={labelStyle}>From</label>
                        <input type="date" value={overviewFrom} onChange={e => setOverviewFrom(e.target.value)}
                          style={{ ...inputStyle, width: 145 }} />
                      </div>
                      <div>
                        <label style={labelStyle}>To</label>
                        <input type="date" value={overviewTo} onChange={e => setOverviewTo(e.target.value)}
                          style={{ ...inputStyle, width: 145 }} />
                      </div>
                    </div>
                  )}
                </>
              )}
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
          ) : activeTab === 'notes' ? (

            /* Notes tab */
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
                {[
                  { key: 'open', label: `Open (${notes.filter(n => !n.note_resolved).length})` },
                  { key: 'resolved', label: `Resolved (${notes.filter(n => n.note_resolved).length})` },
                  { key: 'all', label: 'All' },
                ].map(f => (
                  <button key={f.key} onClick={() => setNotesFilter(f.key)} style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontSize: 12,
                    background: notesFilter === f.key ? GREEN : '#f0f4f0',
                    color: notesFilter === f.key ? '#fff' : '#444',
                  }}>{f.label}</button>
                ))}
                <span style={{ marginLeft: 8, fontSize: 13, color: '#888' }}>{filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f0f4f0' }}>
                      {['Date', 'Employee', 'Location', 'Serial ID', 'Note', 'Priority', 'Status', ''].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotes.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#999' }}>No notes found.</td></tr>
                    ) : filteredNotes.map((l, i) => (
                      <tr key={l.id} style={{
                        background: l.note_resolved ? '#fafafa' : l.note_priority ? '#fffdf0' : (i % 2 === 0 ? '#fff' : '#fafafa'),
                        borderBottom: '1px solid #eee',
                        opacity: l.note_resolved ? 0.65 : 1,
                      }}>
                        <td style={tdStyle}>{l.date}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{l.profiles?.full_name}</td>
                        <td style={tdStyle}>{l.profiles?.location}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{l.serial_id}</td>
                        <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: l.note_resolved ? 'line-through' : 'none', color: '#333' }}>
                          {l.manager_note}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {l.note_priority
                            ? <span style={{ color: '#e67e22', fontWeight: 700, fontSize: 15 }}>⚑</span>
                            : <span style={{ color: '#ddd' }}>—</span>}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            background: l.note_resolved ? '#f0f0f0' : '#fff3cd',
                            border: `1px solid ${l.note_resolved ? '#ddd' : '#ffc107'}`,
                            borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                            color: l.note_resolved ? '#888' : '#856404',
                          }}>
                            {l.note_resolved ? 'Resolved' : 'Open'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={() => { setNoteTarget(l); setNoteText(l.manager_note || ''); setNotePriority(l.note_priority || false); }} style={{
                              background: 'none', border: '1px solid #ddd', borderRadius: 5,
                              padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#666',
                            }}>Edit</button>
                            <button onClick={() => handleManagerResolve(l.id, !l.note_resolved)} style={{
                              background: l.note_resolved ? '#f0f4f0' : '#d4edda',
                              border: `1px solid ${l.note_resolved ? '#ddd' : '#c3e6cb'}`,
                              borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer',
                              fontWeight: 700, color: l.note_resolved ? '#666' : '#155724', whiteSpace: 'nowrap',
                            }}>
                              {l.note_resolved ? 'Reopen' : '✓ Resolve'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          ) : activeTab === 'overview' ? (

            /* Employee overview table */
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={exportOverview} style={exportBtnStyle}>↓ Export CSV</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f0f4f0' }}>
                    {(isReadOnly
                      ? ['Employee', 'Location', 'Listings', 'Easy', 'Medium', 'Hard', 'Complete', 'Total Value']
                      : ['Employee', 'Location', 'Listings', 'Easy', 'Medium', 'Hard', 'Complete', 'Total Value', 'Checklist', '']
                    ).map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeeSummary.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: 20, textAlign: 'center', color: '#999' }}>No employees found.</td></tr>
                  ) : employeeSummary.map(({ emp, count, complete, batches, totalValue }, i) => (
                    <tr key={emp.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>
                        <button onClick={() => setEmpDetail(emp)} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontWeight: 700, fontSize: 13, color: GREEN, padding: 0,
                          textDecoration: 'underline', textDecorationStyle: 'dotted',
                        }}>{emp.full_name}</button>
                      </td>
                      <td style={tdStyle}>{emp.location}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, fontSize: 15 }}>
                        <span style={{ color: GREEN }}>{count}</span>
                      </td>
                      <td style={tdStyle}><span style={{ background: '#d4edda', color: '#155724', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 20 }}>{batches.easy}</span></td>
                      <td style={tdStyle}><span style={{ background: '#fef3e2', color: '#e67e22', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 20 }}>{batches.medium}</span></td>
                      <td style={tdStyle}><span style={{ background: '#fde8e8', color: '#c0392b', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 20 }}>{batches.hard}</span></td>
                      <td style={tdStyle}>
                        <span style={{ color: '#28a745', fontWeight: 600 }}>{complete}</span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: GREEN }}>{formatValue(totalValue)}</td>
                      {!isReadOnly && <td style={tdStyle}>
                        <button onClick={() => handleToggleChecklist(emp)} style={{
                          background: emp.mandatory_checklist ? '#d4edda' : '#f0f0f0',
                          border: `1px solid ${emp.mandatory_checklist ? '#c3e6cb' : '#ddd'}`,
                          borderRadius: 5, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
                          color: emp.mandatory_checklist ? '#155724' : '#888', fontWeight: 700, whiteSpace: 'nowrap',
                        }}>
                          {emp.mandatory_checklist ? 'Required' : 'Optional'}
                        </button>
                      </td>}
                      {!isReadOnly && <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setResetTarget(emp); setResetPassword(''); setResetError(''); }} style={{
                            background: 'none', border: '1px solid #ddd', borderRadius: 5,
                            padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#666', whiteSpace: 'nowrap',
                          }}>Reset pwd</button>
                          <select value={emp.role} onChange={async e => {
                            const newRole = e.target.value;
                            if (!confirm(`Change ${emp.full_name} to ${newRole}?`)) return;
                            const { data: { session: sess } } = await supabase.auth.getSession();
                            await fetch('/api/admin/update-role', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.access_token}` },
                              body: JSON.stringify({ userId: emp.id, role: newRole }),
                            });
                            loadData();
                          }} style={{ ...inputStyle, width: 110, fontSize: 11, padding: '3px 6px' }}>
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
                {employeeSummary.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f0f4f0', fontWeight: 700 }}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>TOTAL</td>
                      <td style={tdStyle}></td>
                      <td style={{ ...tdStyle, fontSize: 15, color: GREEN }}>{employeeSummary.reduce((s, e) => s + e.count, 0)}</td>
                      <td style={{ ...tdStyle, color: '#155724' }}>{employeeSummary.reduce((s, e) => s + e.batches.easy, 0)}</td>
                      <td style={{ ...tdStyle, color: '#e67e22' }}>{employeeSummary.reduce((s, e) => s + e.batches.medium, 0)}</td>
                      <td style={{ ...tdStyle, color: '#c0392b' }}>{employeeSummary.reduce((s, e) => s + e.batches.hard, 0)}</td>
                      <td style={{ ...tdStyle, color: '#28a745' }}>{employeeSummary.reduce((s, e) => s + e.complete, 0)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: GREEN }}>{formatValue(employeeSummary.reduce((s, e) => s + e.totalValue, 0))}</td>
                      <td style={tdStyle}></td>
                      <td style={tdStyle}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

          ) : (

            /* All listings table — activeTab === 'listings' */
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  {filteredListings.length} listing{filteredListings.length !== 1 ? 's' : ''}
                  {location !== 'All Locations' ? ` — ${location}` : ''}
                  {listingsEmployee ? ` — ${employees.find(e => e.id === listingsEmployee)?.full_name}` : ''}
                  {' · '}{['day','week','month','all'].find(k => k === listingsPeriod) === 'day' ? 'Today' : listingsPeriod === 'week' ? 'This Week' : listingsPeriod === 'month' ? 'This Month' : 'All Time'}
                </span>
                <button onClick={exportListings} style={exportBtnStyle}>↓ Export CSV</button>
              </div>
              <div ref={topScrollRef} onScroll={e => { if (scrollRef.current) scrollRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
                style={{ overflowX: 'auto', overflowY: 'hidden', borderBottom: '1px solid #eee' }}>
                <div style={{ height: 8, minWidth: 1800 }} />
              </div>
              <div ref={scrollRef} onScroll={e => { if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
                style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f0f4f0' }}>
                      {['Date / Time', 'Employee', 'Location', 'Serial ID', 'Value', 'Type', 'Metafields', 'Title', 'Price', 'Pic ✓', 'Specs', 'Serial ✓', 'Condition', 'Photos / Batch', 'Difficulty', 'Manager Note', 'Emp Note', ''].map(h => (
                        <th key={h} style={{ ...thStyle, textAlign: h === 'Photos / Batch' ? 'center' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedListings.length === 0 ? (
                      <tr><td colSpan={18} style={{ padding: 20, textAlign: 'center', color: '#999' }}>No listings for this date / location.</td></tr>
                    ) : paginatedListings.map((l, i) => (
                      <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600 }}>{l.date.split('-').reverse().join('/')}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>{formatTime(l.created_at)}</div>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{l.profiles?.full_name}</td>
                        <td style={tdStyle}>{l.profiles?.location}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{l.serial_id}</td>
                        <td style={{ ...tdStyle, color: GREEN, fontWeight: 700 }}>{l.listing_value ? formatValue(l.listing_value) : <span style={{ color: '#ddd' }}>—</span>}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>{l.product_type || <span style={{ color: '#ddd' }}>—</span>}</td>
                        {CHECKLIST.map(c => (
                          <td key={c} style={{ ...tdStyle, textAlign: 'center' }}>
                            {l[c]
                              ? <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>
                              : <span style={{ color: '#ddd' }}>–</span>}
                          </td>
                        ))}
                        <td style={{ ...tdStyle, color: '#666', whiteSpace: 'nowrap' }}>
                          {[l.batches?.comments, l.batches?.description].filter(Boolean).join(' — ')}
                        </td>
                        <td style={tdStyle}><DiffBadge difficulty={l.batches?.difficulty} /></td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => { setNoteTarget(l); setNoteText(l.manager_note || ''); setNotePriority(l.note_priority || false); }}
                            style={{
                              background: l.manager_note
                                ? (l.note_resolved ? '#f8f8f8' : l.note_priority ? '#fff3cd' : '#d4edda')
                                : 'none',
                              border: `1px solid ${l.manager_note ? (l.note_resolved ? '#ddd' : l.note_priority ? '#ffc107' : '#c3e6cb') : '#e0e0e0'}`,
                              borderRadius: 5,
                              cursor: 'pointer',
                              color: l.manager_note ? (l.note_resolved ? '#aaa' : l.note_priority ? '#856404' : '#155724') : '#aaa',
                              fontSize: 11,
                              padding: '2px 7px',
                              whiteSpace: 'nowrap',
                              maxWidth: 120,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textDecoration: l.note_resolved ? 'line-through' : 'none',
                            }}
                            title={l.manager_note || 'Add note'}
                          >
                            {l.note_priority && !l.note_resolved ? '⚑ ' : ''}
                            {l.manager_note
                              ? (l.manager_note.length > 14 ? l.manager_note.slice(0, 14) + '…' : l.manager_note)
                              : '+ Add note'}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, color: '#666', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={l.employee_note || ''}>
                          {l.employee_note
                            ? <span style={{ background: '#e8f0fe', border: '1px solid #c5d3f5', borderRadius: 5, padding: '2px 7px', fontSize: 11, color: '#1a56db' }}>
                                {l.employee_note.length > 16 ? l.employee_note.slice(0, 16) + '…' : l.employee_note}
                              </span>
                            : <span style={{ color: '#ddd' }}>—</span>}
                        </td>
                        {!isReadOnly && <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => { setEditTarget(l); setEditForm({ serial_id: l.serial_id, metafields: l.metafields, title: l.title, price: l.price, photographs: l.photographs, specifications: l.specifications, serial_id_checked: l.serial_id_checked, condition: l.condition }); }} style={{
                              background: 'none', border: '1px solid #c5d3f5', borderRadius: 5,
                              padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#1a56db',
                            }}>Edit</button>
                            <button onClick={() => handleDeleteListing(l.id)} style={{
                              background: 'none', border: '1px solid #e8c0c0', borderRadius: 5,
                              padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#c0392b',
                            }}>Delete</button>
                          </div>
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalListingsPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid #eee' }}>
                  <button onClick={() => setListingsPage(p => Math.max(1, p - 1))} disabled={listingsPage === 1}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: listingsPage === 1 ? 'not-allowed' : 'pointer', color: listingsPage === 1 ? '#ccc' : '#444', fontWeight: 600, fontSize: 12 }}>← Prev</button>
                  <span style={{ fontSize: 13, color: '#666' }}>Page {listingsPage} of {totalListingsPages} · {filteredListings.length} total</span>
                  <button onClick={() => setListingsPage(p => Math.min(totalListingsPages, p + 1))} disabled={listingsPage === totalListingsPages}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: listingsPage === totalListingsPages ? 'not-allowed' : 'pointer', color: listingsPage === totalListingsPages ? '#ccc' : '#444', fontWeight: 600, fontSize: 12 }}>Next →</button>
                </div>
              )}
            </div>
          )}

          {/* Returns section — separate from main metrics */}
          {activeTab === 'overview' && (location === 'All Locations' || location === 'Returns') && returnsEmployeeSummary.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden', marginTop: 16, borderTop: '3px solid #e67e22' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: '#e67e22' }}>Returns</span>
                <span style={{ fontSize: 12, color: '#888' }}>Tracked separately — not included in main totals</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
                  <span>{periodLabel}: <b>{returnsSummary.todayCount}</b></span>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#fef3e2' }}>
                    {['Employee', 'Location', 'Processed', 'Complete', 'Checklist', ''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {returnsEmployeeSummary.map(({ emp, count, complete }, i) => (
                    <tr key={emp.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{emp.full_name}</td>
                      <td style={tdStyle}>{emp.location}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}><span style={{ color: '#e67e22' }}>{count}</span></td>
                      <td style={tdStyle}><span style={{ color: '#28a745', fontWeight: 600 }}>{complete}</span></td>
                      <td style={tdStyle}>
                        <button onClick={() => handleToggleChecklist(emp)} style={{ background: emp.mandatory_checklist ? '#d4edda' : '#f0f0f0', border: `1px solid ${emp.mandatory_checklist ? '#c3e6cb' : '#ddd'}`, borderRadius: 5, padding: '3px 10px', fontSize: 11, cursor: 'pointer', color: emp.mandatory_checklist ? '#155724' : '#888', fontWeight: 700 }}>
                          {emp.mandatory_checklist ? 'Required' : 'Optional'}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setResetTarget(emp); setResetPassword(''); setResetError(''); }} style={{ background: 'none', border: '1px solid #ddd', borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#666' }}>Reset pwd</button>
                          <select value={emp.role} onChange={async e => {
                            const newRole = e.target.value;
                            if (!confirm(`Change ${emp.full_name} to ${newRole}?`)) return;
                            const { data: { session: sess } } = await supabase.auth.getSession();
                            await fetch('/api/admin/update-role', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.access_token}` }, body: JSON.stringify({ userId: emp.id, role: newRole }) });
                            loadData();
                          }} style={{ ...inputStyle, width: 110, fontSize: 11, padding: '3px 6px' }}>
                            <option value="employee">Employee</option>
                            <option value="manager">Manager</option>
                            <option value="supervisor">Supervisor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit listing modal */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setEditTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 480, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Edit Listing</h2>
            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Serial ID</label>
                <input type="text" required value={editForm.serial_id} onChange={e => setEditForm(f => ({ ...f, serial_id: e.target.value }))} style={inputStyle} />
              </div>
              <label style={labelStyle}>Checklist</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, marginBottom: 18 }}>
                {[
                  { key: 'metafields', label: 'Metafields' }, { key: 'title', label: 'Title' }, { key: 'price', label: 'Price' },
                  { key: 'photographs', label: 'Photographs' }, { key: 'specifications', label: 'Specifications' },
                  { key: 'serial_id_checked', label: 'Serial ID' }, { key: 'condition', label: 'Condition' },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, background: editForm[key] ? '#e8f5ee' : '#f5f5f5', border: `1.5px solid ${editForm[key] ? GREEN : '#d0d0d0'}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    <input type="checkbox" checked={editForm[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: GREEN }} />
                    {label}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditTarget(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={editSaving} style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: editSaving ? '#aaa' : GREEN, color: '#fff', cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>{editSaving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                    {['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton', 'Returns'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Role</label>
                  <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} style={inputStyle}>
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="viewer">Viewer (Dispatch / Stock)</option>
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

      {/* Manager note modal */}
      {noteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => { if (e.target === e.currentTarget) { setNoteTarget(null); setNoteText(''); setNotePriority(false); } }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Manager Note</h2>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              {noteTarget.serial_id} — {noteTarget.profiles?.full_name}
            </p>
            <form onSubmit={handleSaveNote}>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={4}
                autoFocus
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                placeholder="Add a manager note…"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={notePriority} onChange={e => setNotePriority(e.target.checked)} />
                  <span style={{ fontWeight: 600, color: notePriority ? '#856404' : '#444' }}>Priority</span>
                </label>
                {noteTarget.manager_note && (
                  <button type="button"
                    onClick={async () => { await handleManagerResolve(noteTarget.id, !noteTarget.note_resolved); setNoteTarget(null); setNoteText(''); setNotePriority(false); }}
                    style={{
                      marginLeft: 'auto',
                      background: noteTarget.note_resolved ? '#f0f4f0' : '#d4edda',
                      border: `1px solid ${noteTarget.note_resolved ? '#ddd' : '#c3e6cb'}`,
                      borderRadius: 5, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                      fontWeight: 700, color: noteTarget.note_resolved ? '#666' : '#155724',
                    }}>
                    {noteTarget.note_resolved ? 'Reopen' : '✓ Resolve'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="button" onClick={() => { setNoteTarget(null); setNoteText(''); setNotePriority(false); }} style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>Cancel</button>
                <button type="submit" disabled={noteSaving} style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: noteSaving ? '#aaa' : GREEN, color: '#fff',
                  cursor: noteSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700,
                }}>{noteSaving ? 'Saving…' : 'Save Note'}</button>
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

      {/* Employee detail modal */}
      {empDetail && (() => {
        const empListings = overviewListings.filter(l => l.user_id === empDetail.id);
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
          }} onClick={e => e.target === e.currentTarget && setEmpDetail(null)}>
            <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 820, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 32px rgba(0,0,0,0.2)' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{empDetail.full_name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{empDetail.location} · {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {empListings.length} listing{empListings.length !== 1 ? 's' : ''}</div>
                </div>
                <button onClick={() => setEmpDetail(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999', lineHeight: 1 }}>×</button>
              </div>
              <div style={{ overflowY: 'auto', overflowX: 'auto' }}>
                {empListings.length === 0 ? (
                  <p style={{ padding: 24, color: '#999', textAlign: 'center', fontSize: 13 }}>No listings for this date.</p>
                ) : (() => {
                  const groupMap = {};
                  const groups = [];
                  for (const l of empListings) {
                    const bid = l.batch_id || '__none';
                    if (!groupMap[bid]) {
                      groupMap[bid] = { bid, batch: l.batches, items: [] };
                      groups.push(groupMap[bid]);
                    }
                    groupMap[bid].items.push(l);
                  }
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f0f4f0' }}>
                          {['Time', 'Serial ID', 'Metafields', 'Title', 'Price', 'Pic ✓', 'Specs', 'Serial ✓', 'Condition', 'Notes'].map(h => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map(({ bid, batch, items }) => (
                          <React.Fragment key={bid}>
                            {batch && (
                              <tr style={{ background: '#f8f9fa', borderTop: '2px solid #e0e0e0' }}>
                                <td colSpan={10} style={{ padding: '7px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <DiffBadge difficulty={batch.difficulty} />
                                    {(batch.comments || batch.description) && <span style={{ fontSize: 12, color: '#555' }}>{[batch.comments, batch.description].filter(Boolean).join(' — ')}</span>}
                                    {batch.photo_urls?.length > 0 && (
                                      <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
                                        {batch.photo_urls.map((url, idx) => (
                                          <a key={idx} href={url} target="_blank" rel="noreferrer">
                                            <img src={url} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 3, border: '1px solid #ddd' }} />
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                    <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            {items.map((l, i) => (
                              <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #eee' }}>
                                <td style={tdStyle}>{formatTime(l.created_at)}</td>
                                <td style={{ ...tdStyle, fontWeight: 700 }}>{l.serial_id}</td>
                                {['metafields', 'title', 'price', 'photographs', 'specifications', 'serial_id_checked', 'condition'].map(c => (
                                  <td key={c} style={{ ...tdStyle, textAlign: 'center' }}>
                                    {l[c]
                                      ? <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>
                                      : <span style={{ color: '#ddd' }}>–</span>}
                                  </td>
                                ))}
                                <td style={{ ...tdStyle, color: '#666', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {l.manager_note || ''}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
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

  if (!profile || (profile.role !== 'manager' && profile.role !== 'supervisor')) {
    return { redirect: { destination: '/dashboard', permanent: false } };
  }

  return { props: { profile, isReadOnly: profile.role === 'supervisor' } };
}
