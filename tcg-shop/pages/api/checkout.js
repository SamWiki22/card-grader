import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { deckPricing, round2 } from "../../lib/pricing";
import { createCheckoutSession } from "../../lib/stripe";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

// POST { items: [{ kind: "card"|"deck", id, quantity }], email, name, note }
// Prices and stock are always re-read from the database; client-sent prices are ignored.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!supabaseAdmin) return res.status(500).json({ error: "Store is not configured (SUPABASE_SERVICE_ROLE_KEY missing)" });

  const { items, email, name = "", note = "" } = req.body || {};
  if (!EMAIL_RE.test(String(email || ""))) return res.status(400).json({ error: "A valid email is required" });
  if (!Array.isArray(items) || !items.length || items.length > 100) return res.status(400).json({ error: "Cart is empty" });
  for (const it of items) {
    if (!["card", "deck"].includes(it?.kind) || !UUID_RE.test(String(it.id)) || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 99) {
      return res.status(400).json({ error: "Invalid cart item" });
    }
  }

  const cardIds = items.filter(i => i.kind === "card").map(i => i.id);
  const deckIds = items.filter(i => i.kind === "deck").map(i => i.id);
  const [cardsRes, decksRes] = await Promise.all([
    cardIds.length ? supabaseAdmin.from("cards").select("id,name,set_code,condition,price,quantity").in("id", cardIds) : { data: [] },
    deckIds.length
      ? supabaseAdmin.from("decks").select("id,name,price,discount_pct,quantity,published,deck_cards(count,card:cards(id,price,quantity))").in("id", deckIds)
      : { data: [] },
  ]);
  if (cardsRes.error || decksRes.error) return res.status(500).json({ error: (cardsRes.error || decksRes.error).message });
  const cards = Object.fromEntries(cardsRes.data.map(c => [c.id, c]));
  const decks = Object.fromEntries(decksRes.data.map(d => [d.id, d]));

  const lines = [];
  for (const it of items) {
    if (it.kind === "card") {
      const c = cards[it.id];
      if (!c || Number(c.price) <= 0) return res.status(409).json({ error: "An item in your cart is no longer available" });
      if (c.quantity < it.quantity) return res.status(409).json({ error: `Only ${c.quantity} of ${c.name} left in stock` });
      const label = [c.name, c.set_code, c.condition].filter(Boolean).join(" · ");
      lines.push({ kind: "card", ref_id: c.id, name: label, unit_price: Number(c.price), quantity: it.quantity });
    } else {
      const d = decks[it.id];
      const { price } = d ? deckPricing(d, d.deck_cards) : {};
      if (!d || !d.published || !price) return res.status(409).json({ error: "A deck in your cart is no longer available" });
      if (d.quantity < it.quantity) return res.status(409).json({ error: `Only ${d.quantity} of ${d.name} left in stock` });
      lines.push({ kind: "deck", ref_id: d.id, name: `${d.name} (pre-built deck)`, unit_price: price, quantity: it.quantity });
    }
  }
  const total = round2(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0));

  const { data: order, error: oErr } = await supabaseAdmin
    .from("orders")
    .insert({ email: String(email).trim(), name: String(name).slice(0, 200), note: String(note).slice(0, 2000), total })
    .select("id")
    .single();
  if (oErr) return res.status(500).json({ error: oErr.message });
  const { error: iErr } = await supabaseAdmin.from("order_items").insert(lines.map(l => ({ ...l, order_id: order.id })));
  if (iErr) return res.status(500).json({ error: iErr.message });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(200).json({ orderId: order.id, status: "pending_payment" });
  }

  const site = (process.env.SITE_URL || `https://${req.headers.host}`).replace(/\/$/, "");
  try {
    const session = await createCheckoutSession({
      mode: "payment",
      customer_email: String(email).trim(),
      success_url: `${site}/order/success?order=${order.id}`,
      cancel_url: `${site}/cart`,
      metadata: { order_id: order.id },
      shipping_address_collection: { allowed_countries: { 0: "US", 1: "CA" } },
      line_items: Object.fromEntries(
        lines.map((l, i) => [
          i,
          {
            quantity: l.quantity,
            price_data: { currency: "usd", unit_amount: Math.round(l.unit_price * 100), product_data: { name: l.name } },
          },
        ]),
      ),
    });
    await supabaseAdmin.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return res.status(200).json({ url: session.url });
  } catch (e) {
    await supabaseAdmin.from("orders").update({ status: "cancelled", note: `Stripe error: ${e.message}` }).eq("id", order.id);
    return res.status(502).json({ error: `Payment setup failed: ${e.message}` });
  }
}
