import { createAdminClient } from '../../lib/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.status(200).json({ shopify: null, listings: [] });

  const admin = createAdminClient();
  const token = process.env.SHOPIFY_LISTINGS_ACCESS_TOKEN;
  const store = process.env.SHOPIFY_LISTINGS_STORE || process.env.SHOPIFY_STORE;

  // Search listings DB and Shopify in parallel
  const [dbResult, shopifyResult] = await Promise.allSettled([
    admin
      .from('listings')
      .select('*, profiles(full_name, location), batches(comments, description)')
      .ilike('serial_id', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(100),

    token && store
      ? fetch(`https://${store}/admin/api/2025-01/graphql.json`, {
          method: 'POST',
          headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{
              productVariants(first: 5, query: "sku:*${q.replace(/"/g, '')}*") {
                edges {
                  node {
                    sku
                    price
                    product {
                      title
                      productType
                      featuredImage { url }
                    }
                  }
                }
              }
            }`,
          }),
        }).then(r => r.json())
      : Promise.resolve(null),
  ]);

  const listings = dbResult.status === 'fulfilled' ? (dbResult.value.data || []) : [];

  let shopify = null;
  if (shopifyResult.status === 'fulfilled' && shopifyResult.value) {
    const edges = shopifyResult.value?.data?.productVariants?.edges || [];
    if (edges.length > 0) {
      const node = edges[0].node;
      shopify = {
        sku: node.sku,
        title: node.product.title,
        productType: node.product.productType || null,
        price: node.price,
        image: node.product.featuredImage?.url || null,
      };
    }
  }

  return res.status(200).json({ shopify, listings });
}
