export default async function handler(req, res) {
  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });

  const token = process.env.SHOPIFY_LISTINGS_ACCESS_TOKEN;
  const store = process.env.SHOPIFY_LISTINGS_STORE || process.env.SHOPIFY_STORE;

  if (!token) return res.status(500).json({ error: 'SHOPIFY_LISTINGS_ACCESS_TOKEN not set in Netlify env vars' });

  try {
    const variantRes = await fetch(
      `https://${store}/admin/api/2024-04/variants.json?barcode=${encodeURIComponent(barcode)}&fields=id,price,product_id`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const variantData = await variantRes.json();
    const variant = variantData.variants?.[0];
    if (!variant) return res.status(404).json({ error: 'Product not found', count: variantData.variants?.length, raw: variantData });

    const productRes = await fetch(
      `https://${store}/admin/api/2024-04/products/${variant.product_id}.json?fields=id,title,images`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    const productData = await productRes.json();
    const product = productData.product;

    return res.status(200).json({
      title: product.title,
      price: variant.price,
      image: product.images?.[0]?.src || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
