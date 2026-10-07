import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { verifyStripeSignature } from "../../lib/stripe";

// Stripe -> Developers -> Webhooks: point at https://<site>/api/stripe-webhook,
// event "checkout.session.completed", and put the signing secret in STRIPE_WEBHOOK_SECRET.
export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const raw = await readRaw(req);
  if (!verifyStripeSignature(raw, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).json({ error: "Bad signature" });
  }
  const event = JSON.parse(raw);
  if (event.type === "checkout.session.completed" && event.data?.object?.payment_status === "paid") {
    const orderId = event.data.object.metadata?.order_id;
    if (orderId && supabaseAdmin) {
      const { error } = await supabaseAdmin.rpc("fulfill_order", { p_order: orderId });
      if (error) return res.status(500).json({ error: error.message }); // Stripe retries
    }
  }
  return res.status(200).json({ received: true });
}
