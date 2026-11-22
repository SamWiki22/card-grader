import { stripe } from "../../lib/stripe";
import { db } from "../../lib/catalog";
import { changeQty } from "../../lib/stock";
import { shippingConfig } from "../../lib/shipping";

// Stripe needs the raw body to verify the signature.
export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

// After a paid checkout: log each line as a sale in the shared "sales" table
// (so it shows in BB Inventory) and take the quantity out of stock.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!stripe || !db || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(501).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(await rawBody(req), req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook error: ${e.message}`);
  }

  const session = event.data.object;
  const paid = (event.type === "checkout.session.completed" && session.payment_status === "paid")
    || event.type === "checkout.session.async_payment_succeeded";
  if (!paid) return res.json({ received: true });

  // Pack credit top-up: credit the shopper's balance once per Stripe session.
  if (session.metadata?.kind === "topup") {
    const { error } = await db.rpc("credit_deposit", { p_user: session.metadata.user_id, p_amount: session.amount_total, p_ref: session.id });
    if (error) { console.error(error); return res.status(500).json({ error: "Failed to credit balance" }); }
    return res.json({ received: true });
  }

  try {
    const { data: lines } = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100, expand: ["data.price.product"] });
    const buyer = session.customer_details?.name || session.customer_details?.email || "customer";
    // Store pickup orders are logged as "Website pickup (…)" so the booth knows to hold them.
    let pickup = false;
    const rateId = session.shipping_cost?.shipping_rate;
    if (rateId) {
      try { pickup = /pickup/i.test((await stripe.shippingRates.retrieve(rateId)).display_name || ""); }
      catch (e) { console.error("shipping rate lookup", e.message); }
    }

    for (const [i, line] of lines.entries()) {
      const itemId = line.price?.product?.metadata?.item_id;
      if (!itemId) continue;
      const qty = line.quantity || 0;
      const { data: item } = await db.from("items").select("*").eq("id", itemId).maybeSingle();

      // The sale id is derived from the Stripe session, so a retried webhook
      // hits a duplicate key here and never double-counts stock.
      const { error: saleError } = await db.from("sales").insert({
        id: `stripe_${session.id}_${i}`,
        item_id: itemId,
        item_name: item?.name || line.description || "",
        item_set: item?.set_name || "",
        item_type: item?.type || "",
        owner: item?.owner || "",
        item_cost: Number(item?.cost) || 0,
        quantity: qty,
        price: (line.price?.unit_amount || 0) / 100,
        total: (line.amount_total || 0) / 100,
        sold_by: `${pickup ? "Website pickup" : "Website"} (${buyer})`,
        thumbnail: null,
      });
      if (saleError?.code === "23505") continue;
      if (saleError) throw saleError;

      // Decrement with a compare-and-set so a sale rung up at the booth (BB
      // Inventory) at the same moment isn't overwritten.
      if (item) {
        try { await changeQty(db, itemId, -qty); }
        catch (e) { console.error(`STOCK NOT REDUCED for website sale stripe_${session.id}_${i} (${item.name} ×${qty}):`, e.message); }
      }
    }
    // Vault cards the shopper added to this order go in the same package (no extra fee).
    await shipVaultCards(session, buyer, pickup);
    // An offer bought through its link is done.
    if (session.metadata?.offer_id) {
      await db.from("offers").update({ status: "purchased", updated_at: new Date().toISOString() }).eq("id", session.metadata.offer_id);
    }
    res.json({ received: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to record sale" });
  }
}

async function shipVaultCards(session, buyer, pickup) {
  const m = session.metadata || {};
  const ids = Object.keys(m).filter(k => /^vault_\d+$/.test(k)).sort().flatMap(k => String(m[k]).split(",")).filter(Boolean);
  if (!m.user_id || !ids.length) return;
  // Only cards still in their vault (a retried webhook finds none and does nothing).
  const { data } = await db.from("pack_cards").select("id").eq("owner_id", m.user_id).eq("status", "held").in("id", ids);
  const cards = (data || []).map(c => c.id);
  if (!cards.length) return;
  const sd = session.collected_information?.shipping_details || session.shipping_details || {};
  const a = sd.address || {};
  const cfg = shippingConfig();
  const address = pickup
    ? { name: buyer, line1: `STORE PICKUP — ${cfg.pickupName}`, line2: "", city: "", state: "", zip: "", pickup: true, order: session.id }
    : { name: sd.name || buyer, line1: a.line1 || "", line2: a.line2 || "", city: a.city || "", state: a.state || "", zip: a.postal_code || "", order: session.id };
  const { error } = await db.rpc("request_shipment", { p_user: m.user_id, p_cards: cards, p_address: address, p_fee: 0 });
  if (error) console.error(`VAULT CARDS NOT QUEUED for order ${session.id}:`, error.message);
}
