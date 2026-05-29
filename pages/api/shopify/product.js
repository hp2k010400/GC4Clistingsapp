export default async function handler(req, res) {
  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });

  const token = process.env.SHOPIFY_LISTINGS_ACCESS_TOKEN;
  const store = process.env.SHOPIFY_LISTINGS_STORE || process.env.SHOPIFY_STORE;

  if (!token) return res.status(500).json({ error: 'SHOPIFY_LISTINGS_ACCESS_TOKEN not set in Netlify env vars' });

  try {
    const headers = { 'X-Shopify-Access-Token': token };

    // Search by tag (most reliable — serial ID is always stored as a Shopify tag)
    const tagRes = await fetch(
      `https://${store}/admin/api/2026-04/products.json?tag=${encodeURIComponent(barcode)}&fields=id,title,variants,images&limit=1&status=any`,
      { headers }
    );
    const tagData = await tagRes.json();
    const product = tagData.products?.[0];

    if (!product) return res.status(404).json({
      error: 'Product not found',
      searched: barcode,
      count: tagData.products?.length,
      shopify_status: tagRes.status,
      raw: tagData,
    });

    const variant = product.variants?.[0];

    return res.status(200).json({
      title: product.title,
      price: variant?.price || null,
      image: product.images?.[0]?.src || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
