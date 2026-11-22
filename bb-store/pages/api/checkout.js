import { stripe } from "../../lib/stripe";
import { getProductsByIds } from "../../lib/catalog";
import { GAME_LABEL } from "../../lib/shared";
import { getOffer, offerPrice } from "../../lib/offers";
import { shippingConfig, shippingPlan } from "../../lib/shipping";
import { getUser } from "../../lib/auth";
import { db } from "../../lib/catalog";

// Vault card ids ride along in Stripe metadata (500 characters per key), split over a few keys.
const VAULT_KEYS = 4, PER_KEY = 28;

// Builds a Stripe Checkout session from the cart. Prices and stock come from
// the inventory database — never from the browser.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!stripe) return res.status(501).json({ error: "Online checkout isn’t set up yet." });

  // Buying an accepted offer: one item, at the agreed price, from the offer link.
  let offer = null;
  if (req.body?.offer) {
    offer = await getOffer(req.body.offer);
    if (offerPrice(offer) == null) return res.status(409).json({ error: "This offer isn’t open for checkout (it may have expired)." });
  }

  const requested = new Map();
  if (offer) requested.set(offer.item_id, offer.quantity);
  for (const l of offer ? [] : Array.isArray(req.body?.lines) ? req.body.lines.slice(0, 100) : []) {
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
  const planLines = [];
  for (const [id, qty] of requested) {
    const p = byId[id];
    if (!p || p.price <= 0 || p.stock <= 0) { problems.push("An item in your cart just sold out."); continue; }
    if (qty > p.stock) { problems.push(`Only ${p.stock} of “${p.name}” left.`); continue; }
    const unit = offer ? Number(offerPrice(offer)) : Math.round(p.price * 100);
    subtotalCents += unit * qty;
    planLines.push({ type: p.type, priceCents: unit, qty });
    lineItems.push({
      quantity: qty,
      price_data: {
        currency: "usd",
        unit_amount: unit,
        product_data: {
          name: p.name,
          description: [GAME_LABEL[p.game], p.set, p.type === "single" ? p.condition : "Sealed"].filter(Boolean).join(" · ") || undefined,
          metadata: offer ? { item_id: p.id, offer_id: offer.id } : { item_id: p.id },
        },
      },
    });
  }
  if (problems.length) return res.status(409).json({ error: `${problems.join(" ")} Refresh your cart and try again.` });

  // "Ship my vault cards with this order": every card the shopper holds in their vault.
  let user = null, vaultIds = [];
  if (req.body?.vault && !offer) {
    user = await getUser(req, res);
    if (!user) return res.status(401).json({ error: "Sign in to add your vault cards to this order." });
    const { data, error } = await db.from("pack_cards").select("id").eq("owner_id", user.id).eq("status", "held").order("held_at").limit(VAULT_KEYS * PER_KEY);
    if (error) { console.error(error); return res.status(500).json({ error: "Couldn’t load your vault. Try again." }); }
    vaultIds = (data || []).map(c => c.id);
  }
  const vaultMeta = {};
  for (let k = 0; k * PER_KEY < vaultIds.length; k++) vaultMeta[`vault_${k}`] = vaultIds.slice(k * PER_KEY, (k + 1) * PER_KEY).join(",");

  // Bulk-only orders need a minimum to ship (pickup is always fine); see lib/shipping.js.
  const cfg = shippingConfig();
  const plan = shippingPlan(planLines, cfg, { vaultCards: vaultIds.length });
  if (!plan.options.length) {
    const need = (cfg.minOrderCents / 100).toFixed(2), short = (plan.shortCents / 100).toFixed(2);
    return res.status(409).json({ error: "Bulk orders need at least $" + need + " to ship. Add $" + short + " more." });
  }
  const shippingOptions = plan.options.map(o => ({
    shipping_rate_data: { display_name: o.name, type: "fixed_amount", fixed_amount: { amount: o.cents, currency: "usd" } },
  }));
  const pickupOnly = plan.options.every(o => o.id === "pickup");

  const origin = process.env.SITE_URL || `https://${req.headers.host}`;
  try {
    const session = await stripe.checkout.sessions.create({
      ...(offer ? { metadata: { offer_id: offer.id }, customer_email: offer.email } : {}),
      ...(vaultIds.length ? { metadata: { user_id: user.id, ...vaultMeta }, customer_email: user.email || undefined } : {}),
      mode: "payment",
      line_items: lineItems,
      // Pickup-only orders (bulk under the shipping minimum) don't need an address.
      ...(pickupOnly ? {} : { shipping_address_collection: { allowed_countries: ["US"] } }),
      shipping_options: shippingOptions,
      phone_number_collection: { enabled: true },
      // Where to pick up, shown above the Pay button when pickup is an option.
      ...(cfg.pickup ? { custom_text: { submit: { message: `Store pickup: ${cfg.pickupName} — ${cfg.pickupAddress}. We'll text you when your order is ready.` } } } : {}),
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: offer ? `${origin}/offer/${offer.id}` : `${origin}/cart`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Couldn’t start checkout. Try again in a moment." });
  }
}
