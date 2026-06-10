export default async () => {
  const siteUrl = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error('No site URL env var found');
    return;
  }

  const res = await fetch(`${siteUrl}/api/admin/send-report`, {
    method: 'POST',
    headers: { 'x-report-secret': process.env.REPORT_SECRET },
  });

  const data = await res.json();
  console.log('Daily report result:', JSON.stringify(data));
};

export const config = {
  schedule: '0 6 * * 2-6',
};
