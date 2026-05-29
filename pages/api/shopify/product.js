export default async function handler(req, res) {
  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });

  const token = process.env.SHOPIFY_LISTINGS_ACCESS_TOKEN;
  const store = process.env.SHOPIFY_LISTINGS_STORE || process.env.SHOPIFY_STORE;

  if (!token) return res.status(500).json({ error: 'SHOPIFY_LISTINGS_ACCESS_TOKEN not set in Netlify env vars' });

  async function queryVariant(queryStr) {
    const res = await fetch(`https://${store}/admin/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({
        query: `{ productVariants(first: 1, query: "${queryStr}") { edges { node { price sku barcode product { title featuredImage { url } } } } } }`,
      }),
    });
    const data = await res.json();
    return data?.data?.productVariants?.edges?.[0]?.node || null;
  }

  try {
    // Try barcode first, then SKU (exact), then SKU with number prefix pattern
    let variant = await queryVariant(`barcode:${barcode}`);
    if (!variant) variant = await queryVariant(`sku:${barcode}`);
    if (!variant) variant = await queryVariant(`sku:*${barcode}*`);

    if (!variant) return res.status(404).json({ error: 'Product not found' });

    return res.status(200).json({
      title: variant.product.title,
      price: variant.price,
      image: variant.product.featuredImage?.url || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
