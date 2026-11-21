import { getProductsByIds } from "../../lib/catalog";

// Returns live price/stock for the items in a shopper's cart.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 100) : [];
  try {
    const products = await getProductsByIds(ids);
    res.json({ products: products.map(({ id, name, set, price, stock, type }) => ({ id, name, set, price, stock, type })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Couldn’t check inventory" });
  }
}
