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
  const [shopify, setShopify] = useState(null);
  const [listings, setListings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    setShopify(null);
    setListings(null);

    const res = await fetch(`/api/lookup-search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setShopify(data.shopify || null);
    setListings(data.listings || []);
    setLoading(false);
  }

  const thStyle = {
    textAlign: 'left', padding: '8px 12px', fontWeight: 700, fontSize: 11,
    color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', background: '#f0f4f0',
  };
  const tdStyle = { padding: '10px 12px', verticalAlign: 'middle', fontSize: 13, borderBottom: '1px solid #eee' };

  const noResults = searched && !loading && !shopify && listings !== null && listings.length === 0;

  return (
    <>
      <Head><title>GC4C — Serial ID Lookup</title></Head>
      <div style={{ minHeight: '100vh', background: '#f4f6f4' }}>

        <div style={{ background: GREEN, color: '#fff', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.05em' }}>GC4C — Serial ID Lookup</span>
        </div>

        <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 16px' }}>

          {/* Search bar */}
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '24px', marginBottom: 20 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', margin: '0 0 6px' }}>Serial ID Lookup</h1>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>Search any club by serial ID or SKU. Partial matches supported.</p>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Enter serial ID or SKU…"
                autoFocus
                style={{
                  flex: 1, padding: '10px 14px', border: '1.5px solid #d0d0d0',
                  borderRadius: 7, fontSize: 15, outline: 'none', background: '#fafafa',
                }}
              />
              <button type="submit" disabled={loading || !query.trim()} style={{
                background: loading || !query.trim() ? '#aaa' : GREEN,
                color: '#fff', border: 'none', borderRadius: 7,
                padding: '10px 28px', fontWeight: 700, fontSize: 14,
                cursor: loading || !query.trim() ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              }}>
                {loading ? 'Searching…' : 'Search'}
              </button>
            </form>
          </div>

          {loading && (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '28px', textAlign: 'center', color: '#999', fontSize: 14 }}>
              Searching…
            </div>
          )}

          {noResults && (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '28px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#333', marginBottom: 6 }}>No results found</div>
              <div style={{ fontSize: 13, color: '#999' }}>No clubs matching <strong>"{query.trim()}"</strong> found in Shopify or the listings app.</div>
            </div>
          )}

          {/* Shopify product card */}
          {!loading && shopify && (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '20px 24px', marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
              {shopify.image && (
                <img src={shopify.image} alt={shopify.title} style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 8, background: '#f8f8f8', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888' }}>Shopify Product</span>
                  {shopify.productType && (
                    <span style={{ background: '#e8f5ee', color: GREEN, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20 }}>{shopify.productType}</span>
                  )}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a1a', marginBottom: 4 }}>{shopify.title}</div>
                <div style={{ fontSize: 13, color: '#555' }}>
                  SKU: <strong>{shopify.sku}</strong>
                  {shopify.price && <span style={{ marginLeft: 16 }}>Price: <strong style={{ color: GREEN }}>£{Number(shopify.price).toFixed(2)}</strong></span>}
                </div>
              </div>
            </div>
          )}

          {/* Listing history */}
          {!loading && listings !== null && listings.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', padding: '18px 0' }}>
              <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>
                  Listing History — {listings.length} record{listings.length !== 1 ? 's' : ''}
                </span>
                {listings.length === 100 && (
                  <span style={{ fontSize: 12, color: '#e67e22', fontWeight: 600 }}>Showing top 100 — refine your search</span>
                )}
              </div>
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
                    {listings.map((l, i) => {
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
            </div>
          )}

          {/* Found in Shopify but not yet listed */}
          {!loading && shopify && listings !== null && listings.length === 0 && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 10, padding: '16px 20px', marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#856404' }}>
                ⚠ This club was found in Shopify but has not been logged in the listings app yet.
              </span>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
