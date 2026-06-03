import { createClient } from '@supabase/supabase-js';

const LOCATIONS = ['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'];
const RECIPIENTS = ['harryp010400@gmail.com'];

function today() { return new Date().toISOString().slice(0, 10); }

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
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
  return new Date(isoStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function changeChip(current, previous) {
  if (previous === 0) return '';
  const pct = ((current - previous) / previous * 100).toFixed(1);
  const up = current >= previous;
  const color = up ? '#28a745' : '#dc3545';
  const arrow = up ? '↑' : '↓';
  return `<span style="color:${color};font-weight:700;font-size:12px;margin-left:6px">${arrow} ${Math.abs(pct)}%</span>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorised.' });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorised.' });
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (callerProfile?.role !== 'manager') return res.status(403).json({ error: 'Forbidden.' });

  const todayStr = today();
  const yesterdayStr = daysAgo(1);
  const lastWeekStr = daysAgo(7);
  const weekStart = getWeekStart();

  const { data: listings, error: dbError } = await admin
    .from('listings')
    .select('date, user_id, listing_value, product_type, profiles(full_name, location)')
    .gte('date', daysAgo(14))
    .limit(500000);

  if (dbError) return res.status(500).json({ error: 'DB error', detail: dbError.message });

  const isReturn = l => l.profiles?.location === 'Returns';

  const todayMain     = listings.filter(l => l.date === todayStr    && !isReturn(l));
  const yesterdayMain = listings.filter(l => l.date === yesterdayStr && !isReturn(l));
  const lastWeekMain  = listings.filter(l => l.date === lastWeekStr  && !isReturn(l));
  const weekMain      = listings.filter(l => l.date >= weekStart     && !isReturn(l));

  // ── Summary numbers ──────────────────────────────────────────────────────────
  const todayCount     = todayMain.length;
  const todayValue     = todayMain.reduce((s, l) => s + (Number(l.listing_value) || 0), 0);
  const yesterdayCount = yesterdayMain.length;
  const yesterdayValue = yesterdayMain.reduce((s, l) => s + (Number(l.listing_value) || 0), 0);
  const lastWeekCount  = lastWeekMain.length;
  const lastWeekValue  = lastWeekMain.reduce((s, l) => s + (Number(l.listing_value) || 0), 0);
  const weekCount      = weekMain.length;
  const weekValue      = weekMain.reduce((s, l) => s + (Number(l.listing_value) || 0), 0);

  const withValue = todayMain.filter(l => l.listing_value && Number(l.listing_value) > 0);
  const avgValue  = withValue.length > 0
    ? withValue.reduce((s, l) => s + Number(l.listing_value), 0) / withValue.length
    : 0;

  // ── By location ──────────────────────────────────────────────────────────────
  const locationStats = LOCATIONS.map(loc => ({
    loc,
    count: todayMain.filter(l => l.profiles?.location === loc).length,
    value: todayMain.filter(l => l.profiles?.location === loc).reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
  }));

  // ── Top 3 listers today by value ─────────────────────────────────────────────
  const listerMap = {};
  todayMain.forEach(l => {
    const name = l.profiles?.full_name || 'Unknown';
    const loc  = l.profiles?.location  || '';
    if (!listerMap[name]) listerMap[name] = { name, loc, count: 0, value: 0 };
    listerMap[name].count++;
    listerMap[name].value += Number(l.listing_value) || 0;
  });
  const topListers = Object.values(listerMap)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  // ── Club type breakdown ───────────────────────────────────────────────────────
  const typeMap = {};
  todayMain.filter(l => l.product_type).forEach(l => {
    typeMap[l.product_type] = (typeMap[l.product_type] || 0) + 1;
  });
  const typeTotal = Object.values(typeMap).reduce((s, v) => s + v, 0);
  const typeRows = Object.entries(typeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      pct: typeTotal > 0 ? Math.round(count / typeTotal * 100) : 0,
    }));

  // ── HTML ─────────────────────────────────────────────────────────────────────
  const MEDAL = ['🥇', '🥈', '🥉'];

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;background:#f0f2f0;margin:0;padding:24px}
    .wrap{max-width:620px;margin:0 auto}
    .card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:16px}
    .header{background:#005F2C;color:#fff;padding:22px 28px}
    .header h1{margin:0 0 4px;font-size:20px;font-weight:900}
    .header p{margin:0;opacity:.75;font-size:13px}
    .section{padding:20px 24px}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin:0 0 14px}
    .stat-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:0}
    .stat{background:#f8f9f8;border-radius:8px;padding:12px 14px;border-top:3px solid #005F2C}
    .stat.amber{border-top-color:#e67e22}
    .stat.grey{border-top-color:#bbb}
    .stat-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:6px}
    .stat-val{font-size:24px;font-weight:900;color:#005F2C;line-height:1}
    .stat.amber .stat-val{color:#e67e22}
    .stat.grey .stat-val{color:#555}
    .stat-sub{font-size:12px;color:#555;margin-top:4px;font-weight:600}
    .stat-compare{font-size:11px;color:#999;margin-top:6px;line-height:1.5}
    .divider{border:none;border-top:1px solid #f0f0f0;margin:0}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;background:#f8f9f8}
    td{padding:9px 10px;border-bottom:1px solid #f5f5f5;color:#333}
    tr:last-child td{border-bottom:none}
    .bar-wrap{background:#eee;border-radius:4px;overflow:hidden;height:8px;min-width:60px}
    .bar-fill{background:#005F2C;height:8px;border-radius:4px}
    .medal{font-size:16px;margin-right:4px}
    .footer{text-align:center;font-size:11px;color:#aaa;padding:12px}
    .highlight-row td{background:#f0f7f0}
  </style></head><body><div class="wrap">

  <!-- Header -->
  <div class="card">
    <div class="header">
      <h1>GC4C Daily Listings Report</h1>
      <p>${formatDate(todayStr)}</p>
    </div>

    <!-- Today at a glance -->
    <div class="section">
      <div class="section-title">Today at a Glance</div>
      <div class="stat-row">
        <div class="stat">
          <div class="stat-label">Listings</div>
          <div class="stat-val">${todayCount}</div>
          <div class="stat-compare">
            vs yesterday: <b>${yesterdayCount}</b>${changeChip(todayCount, yesterdayCount)}<br>
            vs last ${new Date(lastWeekStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}: <b>${lastWeekCount}</b>${changeChip(todayCount, lastWeekCount)}
          </div>
        </div>
        <div class="stat amber">
          <div class="stat-label">Value Listed</div>
          <div class="stat-val" style="font-size:18px">${formatValue(todayValue)}</div>
          <div class="stat-compare">
            vs yesterday: <b>${formatValue(yesterdayValue)}</b>${changeChip(todayValue, yesterdayValue)}<br>
            vs last ${new Date(lastWeekStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}: <b>${formatValue(lastWeekValue)}</b>${changeChip(todayValue, lastWeekValue)}
          </div>
        </div>
        <div class="stat grey">
          <div class="stat-label">Avg Value / Club</div>
          <div class="stat-val" style="font-size:18px">${avgValue > 0 ? formatValue(avgValue) : '—'}</div>
          <div class="stat-sub" style="margin-top:8px">This Week</div>
          <div class="stat-compare"><b>${weekCount}</b> listings · <b>${formatValue(weekValue)}</b></div>
        </div>
      </div>
    </div>
  </div>

  <!-- By location -->
  <div class="card">
    <div class="section" style="padding-bottom:0">
      <div class="section-title">Today by Location</div>
    </div>
    <table>
      <thead><tr><th>Location</th><th style="text-align:right">Listings</th><th style="text-align:right">Value Listed</th></tr></thead>
      <tbody>
        ${locationStats.map((l, i) => `
          <tr class="${i % 2 === 0 ? '' : 'highlight-row'}">
            <td style="font-weight:700">${l.loc}</td>
            <td style="text-align:right">${l.count}</td>
            <td style="text-align:right;font-weight:700">${formatValue(l.value)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="padding:10px 24px 16px;font-size:12px;color:#888;border-top:1px solid #f0f0f0">
      Total: <strong style="color:#005F2C">${todayCount} listings</strong> · <strong style="color:#005F2C">${formatValue(todayValue)}</strong>
    </div>
  </div>

  ${topListers.length > 0 ? `
  <!-- Top listers -->
  <div class="card">
    <div class="section" style="padding-bottom:0">
      <div class="section-title">Top 3 Listers Today — by Value</div>
    </div>
    <table>
      <thead><tr><th></th><th>Name</th><th>Location</th><th style="text-align:right">Listings</th><th style="text-align:right">Value</th></tr></thead>
      <tbody>
        ${topListers.map((l, i) => `
          <tr${i === 0 ? ' class="highlight-row"' : ''}>
            <td style="font-size:18px;padding:8px 6px 8px 14px">${MEDAL[i]}</td>
            <td style="font-weight:700">${l.name}</td>
            <td style="color:#666">${l.loc}</td>
            <td style="text-align:right">${l.count}</td>
            <td style="text-align:right;font-weight:700;color:#005F2C">${formatValue(l.value)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="height:8px"></div>
  </div>` : ''}

  ${typeRows.length > 0 ? `
  <!-- Club type breakdown -->
  <div class="card">
    <div class="section" style="padding-bottom:0">
      <div class="section-title">Club Types Listed Today</div>
    </div>
    <table>
      <thead><tr><th>Type</th><th style="text-align:right">Count</th><th style="text-align:right">Share</th><th style="width:120px"></th></tr></thead>
      <tbody>
        ${typeRows.map((t, i) => `
          <tr${i % 2 !== 0 ? ' class="highlight-row"' : ''}>
            <td style="font-weight:600">${t.type}</td>
            <td style="text-align:right">${t.count}</td>
            <td style="text-align:right;font-weight:700;color:#005F2C">${t.pct}%</td>
            <td style="padding-right:16px">
              <div class="bar-wrap"><div class="bar-fill" style="width:${t.pct}%"></div></div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="height:8px"></div>
  </div>` : ''}

  <div class="footer">GC4C Listings App · Daily Report · ${todayStr}</div>
</div></body></html>`;

  const subject = `GC4C Daily Report — ${new Date(todayStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${todayCount} listings · ${formatValue(todayValue)}`;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'GC4C Listings <onboarding@resend.dev>',
      to: RECIPIENTS,
      subject,
      html,
    }),
  });

  const result = await resendRes.json();
  if (!resendRes.ok) return res.status(500).json({ error: 'Resend failed', detail: result });
  return res.status(200).json({ success: true, id: result.id });
}
