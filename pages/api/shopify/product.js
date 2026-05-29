export default async function handler(req, res) {
  const { barcode } = req.query;
  if (!barcode) return res.status(400).json({ error: 'barcode required' });

  const token = process.env.SHOPIFY_LISTINGS_ACCESS_TOKEN;
  const store = process.env.SHOPIFY_LISTINGS_STORE || process.env.SHOPIFY_STORE;

  if (!token) return res.status(500).json({ error: 'SHOPIFY_LISTINGS_ACCESS_TOKEN not set' });

  try {
    const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };

    const gqlRes = await fetch(`https://${store}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: `{
          productVariants(first: 1, query: "sku:*${barcode}*") {
            edges {
              node {
                price
                sku
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
    });

    const gqlData = await gqlRes.json();
    const node = gqlData?.data?.productVariants?.edges?.[0]?.node;

    if (!node) return res.status(404).json({ error: 'Product not found', gql_errors: gqlData?.errors });

    return res.status(200).json({
      title: node.product.title,
      price: node.price,
      product_type: node.product.productType || null,
      image: node.product.featuredImage?.url || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
