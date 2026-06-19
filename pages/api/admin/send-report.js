import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const LOCATIONS = ['Edinburgh', 'Warrington', 'Milton Keynes', 'Southampton'];
const RECIPIENTS = [
  'harryp010400@gmail.com',
  'Martin.Lord@golfclubs4cash.co.uk',
  'daniel.thorburn@golfclubs4cash.co.uk',
  'john.mantle@golfclubs4cash.co.uk',
  'michael.knowles@golfclubs4cash.co.uk',
  'murray.winton@golfclubs4cash.co.uk',
  'martin.lambert@golfclubs4cash.co.uk',
  'elliot.fleming@golfclubs4cash.co.uk',
  'David.coles@golfclubs4cash.co.uk',
  'Mike.Currie@golfclubs4cash.co.uk',
  'Connor.Wright@golfclubs4cash.co.uk',
  'Lennon.McMillan@golfclubs4cash.co.uk',
  'Oscar.Doran@golfclubs4cash.co.uk',
  'Morgan.Jones@golfclubs4cash.co.uk',
];

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
  const pct = Math.abs(((current - previous) / previous * 100)).toFixed(1);
  const up = current >= previous;
  const color = up ? '#28a745' : '#dc3545';
  const arrow = up ? '&#8593;' : '&#8595;';
  return `&nbsp;<span style="color:${color};font-weight:700;font-size:12px">${arrow}&nbsp;${pct}%</span>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Allow scheduled function to call with secret key
  const reportSecret = req.headers['x-report-secret'];
  if (reportSecret && reportSecret === process.env.REPORT_SECRET) {
    // authorised via secret — skip user auth
  } else {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorised.' });
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorised.' });
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (callerProfile?.role !== 'manager') return res.status(403).json({ error: 'Forbidden.' });
  }

  // Report covers yesterday (previous full day)
  const todayStr     = daysAgo(1);
  const yesterdayStr = daysAgo(2);
  const lastWeekStr  = daysAgo(8);
  const weekStart    = getWeekStart();
  const lastWeekDay  = new Date(lastWeekStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });

  const { data: listings, error: dbError } = await admin
    .from('listings')
    .select('date, user_id, listing_value, product_type, profiles(full_name, location)')
    .gte('date', daysAgo(14))
    .limit(500000);

  if (dbError) return res.status(500).json({ error: 'DB error', detail: dbError.message });

  const isReturn = l => l.profiles?.location === 'Returns';

  const todayMain     = listings.filter(l => l.date === todayStr     && !isReturn(l));
  const yesterdayMain = listings.filter(l => l.date === yesterdayStr && !isReturn(l));
  const lastWeekMain  = listings.filter(l => l.date === lastWeekStr  && !isReturn(l));
  const weekMain      = listings.filter(l => l.date >= weekStart     && !isReturn(l));

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

  const locationStats = LOCATIONS.map(loc => ({
    loc,
    count: todayMain.filter(l => l.profiles?.location === loc).length,
    value: todayMain.filter(l => l.profiles?.location === loc).reduce((s, l) => s + (Number(l.listing_value) || 0), 0),
  })).sort((a, b) => b.count - a.count);

  const listerMap = {};
  todayMain.forEach(l => {
    const name = l.profiles?.full_name || 'Unknown';
    const loc  = l.profiles?.location  || '';
    if (!listerMap[name]) listerMap[name] = { name, loc, count: 0, value: 0 };
    listerMap[name].count++;
    listerMap[name].value += Number(l.listing_value) || 0;
  });
  const topListers = Object.values(listerMap).sort((a, b) => b.value - a.value).slice(0, 3);
  const topListersByCount = Object.values(listerMap).sort((a, b) => b.count - a.count).slice(0, 3);

  const typeMap = {};
  todayMain.filter(l => l.product_type).forEach(l => {
    typeMap[l.product_type] = (typeMap[l.product_type] || 0) + 1;
  });
  const typeTotal = Object.values(typeMap).reduce((s, v) => s + v, 0);
  const typeRows = Object.entries(typeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count, pct: typeTotal > 0 ? Math.round(count / typeTotal * 100) : 0 }));

  const MEDAL = ['🥇', '🥈', '🥉'];

  const ROW_ODD  = 'background:#f8f9f8';
  const ROW_EVEN = 'background:#ffffff';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f2f0;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto">
  <tr><td>

    <!-- HEADER -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#005F2C;border-radius:10px 10px 0 0;margin-bottom:0">
      <tr><td style="padding:22px 28px">
        <div style="font-size:22px;font-weight:900;color:#ffffff;margin:0 0 4px">GC4C Daily Listings Report</div>
        <div style="font-size:13px;color:#a8d5b8;margin:0">${formatDate(todayStr)}</div>
      </td></tr>
    </table>

    <!-- TODAY AT A GLANCE -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;margin-bottom:16px">
      <tr><td style="padding:20px 24px 8px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:14px">Today at a Glance</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32%" valign="top" style="padding-right:8px">
              <table width="100%" cellpadding="12" cellspacing="0" style="background:#f8f9f8;border-top:3px solid #005F2C;border-radius:8px">
                <tr><td>
                  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:6px">Listings</div>
                  <div style="font-size:26px;font-weight:900;color:#005F2C;line-height:1;margin-bottom:8px">${todayCount}</div>
                  <div style="font-size:11px;color:#999;line-height:1.7">
                    vs yesterday: <b style="color:#333">${yesterdayCount}</b>${changeChip(todayCount, yesterdayCount)}<br>
                    vs last ${lastWeekDay}: <b style="color:#333">${lastWeekCount}</b>${changeChip(todayCount, lastWeekCount)}
                  </div>
                </td></tr>
              </table>
            </td>
            <td width="36%" valign="top" style="padding-right:8px">
              <table width="100%" cellpadding="12" cellspacing="0" style="background:#f8f9f8;border-top:3px solid #e67e22;border-radius:8px">
                <tr><td>
                  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:6px">Value Listed</div>
                  <div style="font-size:20px;font-weight:900;color:#e67e22;line-height:1;margin-bottom:8px">${formatValue(todayValue)}</div>
                  <div style="font-size:11px;color:#999;line-height:1.7">
                    vs yesterday: <b style="color:#333">${formatValue(yesterdayValue)}</b>${changeChip(todayValue, yesterdayValue)}<br>
                    vs last ${lastWeekDay}: <b style="color:#333">${formatValue(lastWeekValue)}</b>${changeChip(todayValue, lastWeekValue)}
                  </div>
                </td></tr>
              </table>
            </td>
            <td width="32%" valign="top">
              <table width="100%" cellpadding="12" cellspacing="0" style="background:#f8f9f8;border-top:3px solid #bbbbbb;border-radius:8px">
                <tr><td>
                  <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:6px">Avg Value / Club</div>
                  <div style="font-size:20px;font-weight:900;color:#444;line-height:1;margin-bottom:8px">${avgValue > 0 ? formatValue(avgValue) : '&mdash;'}</div>
                  <div style="font-size:11px;font-weight:700;color:#555;margin-bottom:3px">This Week</div>
                  <div style="font-size:11px;color:#999">${weekCount} listings<br>${formatValue(weekValue)}</div>
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="height:16px"></td></tr>
    </table>

    <!-- BY LOCATION -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;margin-bottom:16px;border-radius:8px">
      <tr><td style="padding:18px 24px 0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:12px">Today by Location</div>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="background:#f0f4f0">
            <td style="padding:8px 24px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Location</td>
            <td align="right" style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Listings</td>
            <td align="right" style="padding:8px 24px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Value Listed</td>
          </tr>
          ${locationStats.map((l, i) => `
          <tr style="${i % 2 === 0 ? ROW_EVEN : ROW_ODD}">
            <td style="padding:10px 24px;font-size:13px;font-weight:700;color:#222;border-bottom:1px solid #f0f0f0">${l.loc}</td>
            <td align="right" style="padding:10px 16px;font-size:13px;color:#333;border-bottom:1px solid #f0f0f0">${l.count}</td>
            <td align="right" style="padding:10px 24px;font-size:13px;font-weight:700;color:#005F2C;border-bottom:1px solid #f0f0f0">${formatValue(l.value)}</td>
          </tr>`).join('')}
          <tr>
            <td colspan="3" style="padding:10px 24px;font-size:12px;color:#888">
              Total: <b style="color:#005F2C">${todayCount} listings</b> &middot; <b style="color:#005F2C">${formatValue(todayValue)}</b>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>

    ${topListers.length > 0 ? `
    <!-- TOP 3 LISTERS -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;margin-bottom:16px;border-radius:8px">
      <tr><td style="padding:18px 24px 0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:12px">Top 3 Listers Today &mdash; by Value</div>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="background:#f0f4f0">
            <td style="padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666" width="36"></td>
            <td style="padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Name</td>
            <td style="padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Location</td>
            <td align="right" style="padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Listings</td>
            <td align="right" style="padding:8px 24px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Value</td>
          </tr>
          ${topListers.map((l, i) => `
          <tr style="${i === 0 ? 'background:#f0f7f0' : i % 2 === 0 ? ROW_EVEN : ROW_ODD}">
            <td style="padding:10px 12px;font-size:18px;border-bottom:1px solid #f0f0f0">${MEDAL[i]}</td>
            <td style="padding:10px 8px;font-size:13px;font-weight:700;color:#222;border-bottom:1px solid #f0f0f0">${l.name}</td>
            <td style="padding:10px 8px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0">${l.loc}</td>
            <td align="right" style="padding:10px 8px;font-size:13px;color:#333;border-bottom:1px solid #f0f0f0">${l.count}</td>
            <td align="right" style="padding:10px 24px;font-size:13px;font-weight:700;color:#005F2C;border-bottom:1px solid #f0f0f0">${formatValue(l.value)}</td>
          </tr>`).join('')}
        </table>
        <div style="height:8px"></div>
      </td></tr>
    </table>` : ''}

    ${topListersByCount.length > 0 ? `
    <!-- TOP 3 BY COUNT -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;margin-bottom:16px;border-radius:8px">
      <tr><td style="padding:18px 24px 0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:12px">Top 3 Listers Today &mdash; by Listings</div>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="background:#f0f4f0">
            <td style="padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666" width="36"></td>
            <td style="padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Name</td>
            <td style="padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Location</td>
            <td align="right" style="padding:8px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Listings</td>
            <td align="right" style="padding:8px 24px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Value</td>
          </tr>
          ${topListersByCount.map((l, i) => `
          <tr style="${i === 0 ? 'background:#f0f7f0' : i % 2 === 0 ? ROW_EVEN : ROW_ODD}">
            <td style="padding:10px 12px;font-size:18px;border-bottom:1px solid #f0f0f0">${MEDAL[i]}</td>
            <td style="padding:10px 8px;font-size:13px;font-weight:700;color:#222;border-bottom:1px solid #f0f0f0">${l.name}</td>
            <td style="padding:10px 8px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0">${l.loc}</td>
            <td align="right" style="padding:10px 8px;font-size:13px;font-weight:700;color:#005F2C;border-bottom:1px solid #f0f0f0">${l.count}</td>
            <td align="right" style="padding:10px 24px;font-size:13px;color:#333;border-bottom:1px solid #f0f0f0">${formatValue(l.value)}</td>
          </tr>`).join('')}
        </table>
        <div style="height:8px"></div>
      </td></tr>
    </table>` : ''}

    ${typeRows.length > 0 ? `
    <!-- CLUB TYPES -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;margin-bottom:16px;border-radius:8px">
      <tr><td style="padding:18px 24px 0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:12px">Club Types Listed Today</div>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr style="background:#f0f4f0">
            <td style="padding:8px 24px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Type</td>
            <td align="right" style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Count</td>
            <td align="right" style="padding:8px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666">Share</td>
            <td style="padding:8px 24px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#666" width="120"></td>
          </tr>
          ${typeRows.map((t, i) => {
            const barPct = typeRows[0].count > 0 ? Math.round(t.count / typeRows[0].count * 100) : 0;
            return `
          <tr style="${i % 2 === 0 ? ROW_EVEN : ROW_ODD}">
            <td style="padding:10px 24px;font-size:13px;font-weight:600;color:#222;border-bottom:1px solid #f0f0f0">${t.type}</td>
            <td align="right" style="padding:10px 16px;font-size:13px;color:#333;border-bottom:1px solid #f0f0f0">${t.count}</td>
            <td align="right" style="padding:10px 16px;font-size:13px;font-weight:700;color:#005F2C;border-bottom:1px solid #f0f0f0">${t.pct}%</td>
            <td style="padding:10px 24px;border-bottom:1px solid #f0f0f0">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#e8e8e8;border-radius:4px;height:8px">
                <tr><td width="${barPct}%" style="background:#005F2C;border-radius:4px;height:8px;font-size:0">&nbsp;</td><td></td></tr>
              </table>
            </td>
          </tr>`;}).join('')}
        </table>
        <div style="height:8px"></div>
      </td></tr>
    </table>` : ''}

    <!-- FOOTER -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:12px;font-size:11px;color:#aaa">
        GC4C Listings App &middot; Daily Report &middot; ${todayStr}
      </td></tr>
    </table>

  </td></tr>
</table>
</body></html>`;

  const subject = `GC4C Daily Report — ${new Date(todayStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${todayCount} listings · ${formatValue(todayValue)}`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: `GC4C Listings <${process.env.GMAIL_USER}>`,
      to: RECIPIENTS,
      subject,
      html,
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Email failed', detail: err.message });
  }
}
