export default function handler(req, res) {
  const shop = req.query.shop || 'golfclubs4cash.myshopify.com';
  const clientId = process.env.SHOPIFY_LISTINGS_CLIENT_ID;
  const redirectUri = 'https://gc4clistingsapp.netlify.app/api/shopify/callback';
  const scopes = 'read_products';
  const state = 'gc4c2026';

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  res.redirect(authUrl);
}
