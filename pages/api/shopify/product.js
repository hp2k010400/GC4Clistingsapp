let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const store = process.env.SHOPIFY_LISTINGS_STORE || process.env.SHOPIFY_STORE;
  const clientId = process.env.SHOPIFY_LISTINGS_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_LISTINGS_CLIENT_SECRET;

  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });

  try {
    const token = await getAccessToken();
    const store = process.env.SHOPIFY_LISTINGS_STORE;

    const gqlRes = await fetch(`https://${store}/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        query: `{
          productVariants(first: 1, query: "barcode:${barcode}") {
            edges {
              node {
                price
                product {
                  title
                  featuredImage { url }
                }
              }
            }
          }
        }`,
      }),
    });

    const gqlData = await gqlRes.json();
    const variant = gqlData?.data?.productVariants?.edges?.[0]?.node;

    if (!variant) return res.status(404).json({ error: 'Product not found' });

    return res.status(200).json({
      title: variant.product.title,
      price: variant.price,
      image: variant.product.featuredImage?.url || null,
    });
  } catch (err) {
    const store = process.env.SHOPIFY_LISTINGS_STORE || process.env.SHOPIFY_STORE;
    return res.status(500).json({ error: err.message, store: store || 'MISSING', hasClientId: !!process.env.SHOPIFY_LISTINGS_CLIENT_ID, hasClientSecret: !!process.env.SHOPIFY_LISTINGS_CLIENT_SECRET });
  }
}
