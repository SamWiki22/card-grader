import { stripe } from "../../lib/stripe";
import { getProductsByIds } from "../../lib/catalog";
import { GAME_LABEL } from "../../lib/shared";

// Builds a Stripe Checkout session from the cart. Prices and stock come from
// the inventory database — never from the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!stripe) return res.status(501).json({ error: "Online checkout isn’t set up yet." });

  const requested = new Map();
  for (const l of Array.isArray(req.body?.lines) ? req.body.lines.slice(0, 100) : []) {
    const qty = Math.floor(Number(l?.qty));
    if (l?.id && qty > 0) requested.set(String(l.id), (requested.get(String(l.id)) || 0) + qty);
  }
  if (!requested.size) return res.status(400).json({ error: "Your cart is empty." });

  let products;
  try { products = await getProductsByIds([...requested.keys()]); }
  catch (e) { console.error(e); return res.status(500).json({ error: "Couldn’t reach inventory. Try again." }); }

  const byId = Object.fromEntries(products.map(p => [p.id, p]));
  const problems = [];
  const lineItems = [];
  let subtotalCents = 0;
  for (const [id, qty] of requested) {
    const p = byId[id];
    if (!p || p.price <= 0 || p.stock <= 0) { problems.push("An item in your cart just sold out."); continue; }
    if (qty > p.stock) { problems.push(`Only ${p.stock} of “${p.name}” left.`); continue; }
    const unit = Math.round(p.price * 100);
    subtotalCents += unit * qty;
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: "usd",
        unit_amount: unit,
        product_data: {
          name: p.name,
          description: [GAME_LABEL[p.game], p.set, p.type === "single" ? p.condition : "Sealed"].filter(Boolean).join(" · ") || undefined,
          metadata: { item_id: p.id },
        },
      },
    });
  }
  if (problems.length) return res.status(409).json({ error: `${problems.join(" ")} Refresh your cart and try again.` });

  const flat = Number(process.env.SHIPPING_FLAT_CENTS) || 0;
  const freeMin = Number(process.env.FREE_SHIPPING_MIN) || 0;
  const shipCents = freeMin && subtotalCents >= freeMin * 100 ? 0 : flat;
  const shippingOptions = [
    { shipping_rate_data: { display_name: shipCents ? "Standard shipping" : "Free shipping", type: "fixed_amount", fixed_amount: { amount: shipCents, currency: "usd" } } },
  ];
  if (process.env.LOCAL_PICKUP === "true") {
    shippingOptions.push({ shipping_rate_data: { display_name: "Local pickup", type: "fixed_amount", fixed_amount: { amount: 0, currency: "usd" } } });
  }

  const origin = process.env.SITE_URL || `https://${req.headers.host}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: shippingOptions,
      phone_number_collection: { enabled: true },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cart`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Couldn’t start checkout. Try again in a moment." });
  }
}
