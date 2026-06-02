import { createClient } from '@supabase/supabase-js';

const LOCATIONS = ['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'];
// TODO: update recipients with John's list
const RECIPIENTS = ['harryphee010400@gmail.com'];
// TODO: update send time with John's preference (currently 6pm UK)
// Cron is UTC — 6pm BST = 17:00 UTC (summer), 6pm GMT = 18:00 UTC (winter)
const SEND_FROM = 'GC4C Listings <onboarding@resend.dev>';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

function formatValue(v) {
  if (!v) return '£0';
  return `£${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(isoStr) {
  return new Date(isoStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function handler() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const todayStr = today();
  const weekStart = getWeekStart();

  // Load all listings from week start
  const { data: listings } = await supabase
    .from('listings')
    .select('date, user_id, listing_value, product_type, profiles(full_name, location)')
    .gte('date', weekStart)
    .limit(10000);

  if (!listings) return { statusCode: 500, body: 'Failed to load listings' };

  const todayListings = listings.filter(l => l.date === todayStr);
  const weekListings = listings;

  // Per location breakdown
  const locationStats = LOCATIONS.map(loc => {
    const todayLoc = todayListings.filter(l => l.profiles?.location === loc);
    const weekLoc = weekListings.filter(l => l.profiles?.location === loc);
    return {
      loc,
      todayCount: todayLoc.length,
      todayValue: todayLoc.reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
      weekCount: weekLoc.length,
      weekValue: weekLoc.reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
    };
  });

  // Product type breakdown (today)
  const productTypes = {};
  todayListings.filter(l => l.product_type && l.profiles?.location !== 'Returns').forEach(l => {
    productTypes[l.product_type] = (productTypes[l.product_type] || 0) + 1;
  });
  const productRows = Object.entries(productTypes).sort((a, b) => b[1] - a[1]);

  // Business totals
  const todayTotal = locationStats.reduce((s, l) => s + l.todayCount, 0);
  const todayValue = locationStats.reduce((s, l) => s + l.todayValue, 0);
  const weekTotal = locationStats.reduce((s, l) => s + l.weekCount, 0);
  const weekValue = locationStats.reduce((s, l) => s + l.weekValue, 0);

  // Build HTML email
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6f4; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #005F2C; color: #fff; padding: 24px 28px; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p { margin: 4px 0 0; opacity: 0.8; font-size: 13px; }
    .section { padding: 20px 28px; border-bottom: 1px solid #eee; }
    .section h2 { margin: 0 0 14px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
    .location-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .location-card { background: #f8f9f8; border-radius: 8px; padding: 12px 14px; border-left: 3px solid #005F2C; }
    .location-card h3 { margin: 0 0 8px; font-size: 12px; color: #666; text-transform: uppercase; }
    .location-card .count { font-size: 22px; font-weight: 900; color: #005F2C; }
    .location-card .value { font-size: 13px; color: #333; font-weight: 600; }
    .location-card .week { font-size: 11px; color: #888; margin-top: 6px; }
    .total-card { background: #005F2C; color: #fff; border-radius: 8px; padding: 16px 20px; margin-top: 14px; display: flex; justify-content: space-between; }
    .total-card .label { font-size: 11px; opacity: 0.75; text-transform: uppercase; }
    .total-card .val { font-size: 22px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 10px; background: #f0f4f0; color: #555; font-size: 11px; text-transform: uppercase; }
    td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
    .footer { padding: 16px 28px; font-size: 11px; color: #aaa; text-align: center; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>GC4C Daily Listings Report</h1>
    <p>${formatDate(todayStr)}</p>
  </div>

  <div class="section">
    <h2>Today by Location</h2>
    <div class="location-grid">
      ${locationStats.map(l => `
        <div class="location-card">
          <h3>${l.loc}</h3>
          <div class="count">${l.todayCount}</div>
          <div class="value">${formatValue(l.todayValue)}</div>
          <div class="week">Week: ${l.weekCount} · ${formatValue(l.weekValue)}</div>
        </div>
      `).join('')}
    </div>
    <div class="total-card">
      <div>
        <div class="label">Today Total</div>
        <div class="val">${todayTotal}</div>
        <div style="font-size:13px;margin-top:2px;">${formatValue(todayValue)}</div>
      </div>
      <div style="text-align:right;">
        <div class="label">This Week</div>
        <div class="val">${weekTotal}</div>
        <div style="font-size:13px;margin-top:2px;">${formatValue(weekValue)}</div>
      </div>
    </div>
  </div>

  ${productRows.length > 0 ? `
  <div class="section">
    <h2>Product Types Listed Today</h2>
    <table>
      <thead><tr><th>Type</th><th>Count</th></tr></thead>
      <tbody>
        ${productRows.map(([type, count]) => `<tr><td>${type}</td><td><b>${count}</b></td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">GC4C Listings App · Generated automatically at 6pm</div>
</div>
</body>
</html>`;

  // Send via Resend
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: SEND_FROM,
      to: RECIPIENTS,
      subject: `GC4C Daily Report — ${todayStr} · ${todayTotal} listings · ${formatValue(todayValue)}`,
      html,
    }),
  });

  const result = await res.json();
  console.log('Daily report sent:', result);
  return { statusCode: 200, body: JSON.stringify(result) };
}

export const config = {
  schedule: '0 17 * * 1-5',  // 6pm BST (5pm UTC), Mon-Fri
};
