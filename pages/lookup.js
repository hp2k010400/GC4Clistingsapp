import { useState } from 'react';
import Head from 'next/head';

const GREEN = '#005F2C';

const CHECKLIST_KEYS = ['metafields', 'title', 'price', 'photographs', 'specifications', 'serial_id_checked', 'condition'];

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatValue(v) {
  if (!v) return '—';
  return `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Lookup() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);

    const res = await fetch(`/api/lookup-search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.results || []);
    setLoading(false);
  }

  const thStyle = { textAlign: 'left', padding: '8px 12px', fontWeight: 700, fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', background: '#f0f4f0' };
  const tdStyle = { padding: '10px 12px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #eee' };

  return (
    <>
      <Head><title>GC4C — Serial ID Lookup</title></Head>
      <div style={{ minHeight: '100vh', background: '#f4f6f4' }}>

        <div style={{ background: GREEN, color: '#fff', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.05em' }}>GC4C — Serial ID Lookup</span>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px' }}>

          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '24px', marginBottom: 20 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', margin: '0 0 6px' }}>Serial ID Lookup</h1>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>Search for any listed club by serial ID. Partial matches supported.</p>

            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Enter serial ID e.g. GC-12345"
                autoFocus
                style={{
                  flex: 1, padding: '10px 14px', border: '1.5px solid #d0d0d0',
                  borderRadius: 7, fontSize: 15, outline: 'none', background: '#fafafa',
                }}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                style={{
                  background: loading || !query.trim() ? '#aaa' : GREEN,
                  color: '#fff', border: 'none', borderRadius: 7,
                  padding: '10px 24px', fontWeight: 700, fontSize: 14,
                  cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </form>
          </div>

          {searched && !loading && (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '18px 0' }}>
              <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>
                  {results.length === 0
                    ? 'No results found'
                    : `${results.length} result${results.length !== 1 ? 's' : ''} for "${query.trim()}"`}
                </span>
                {results.length === 100 && (
                  <span style={{ fontSize: 12, color: '#e67e22', fontWeight: 600 }}>Showing top 100 — refine your search</span>
                )}
              </div>

              {results.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Serial ID</th>
                        <th style={thStyle}>Date Listed</th>
                        <th style={thStyle}>Time</th>
                        <th style={thStyle}>Listed By</th>
                        <th style={thStyle}>Location</th>
                        <th style={thStyle}>Product Type</th>
                        <th style={thStyle}>Value</th>
                        <th style={thStyle}>Checklist</th>
                        <th style={thStyle}>Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((l, i) => {
                        const allChecked = CHECKLIST_KEYS.every(k => l[k]);
                        return (
                          <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ ...tdStyle, fontWeight: 700, color: GREEN }}>{l.serial_id}</td>
                            <td style={tdStyle}>{formatDate(l.date)}</td>
                            <td style={tdStyle}>{formatTime(l.created_at)}</td>
                            <td style={tdStyle}>{l.profiles?.full_name || '—'}</td>
                            <td style={tdStyle}>{l.profiles?.location || '—'}</td>
                            <td style={tdStyle}>{l.product_type || '—'}</td>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>{formatValue(l.listing_value)}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              {allChecked
                                ? <span style={{ background: '#d4edda', color: '#155724', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>Complete</span>
                                : <span style={{ background: '#fff3cd', color: '#856404', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>Partial</span>}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 12, color: '#666' }}>
                              {[l.batches?.comments, l.batches?.description].filter(Boolean).join(' — ') || '—'}
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
    </>
  );
}
