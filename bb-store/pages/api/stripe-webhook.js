import { stripe } from "../../lib/stripe";
import { db } from "../../lib/catalog";

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

  try {
    const { data: lines } = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100, expand: ["data.price.product"] });
    const buyer = session.customer_details?.name || session.customer_details?.email || "customer";

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
        sold_by: `Website (${buyer})`,
        thumbnail: null,
      });
      if (saleError?.code === "23505") continue;
      if (saleError) throw saleError;

      // Decrement with a compare-and-set so a sale rung up in the shop at the
      // same moment isn't overwritten.
      for (let attempt = 0; attempt < 5 && item; attempt++) {
        const { data: cur } = await db.from("items").select("quantity").eq("id", itemId).maybeSingle();
        if (!cur) break;
        const { data: updated } = await db.from("items")
          .update({ quantity: Math.max(0, cur.quantity - qty) })
          .eq("id", itemId).eq("quantity", cur.quantity).select("id");
        if (updated?.length) break;
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to record sale" });
  }
}
