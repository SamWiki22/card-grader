import { requireUser } from "../../../lib/auth";
import { stripe } from "../../../lib/stripe";
import { TOPUP_AMOUNTS } from "../../../lib/shared";

// Starts a Stripe Checkout for pack credit. The balance is only credited by
// the webhook once Stripe confirms payment.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req, res);
  if (!user) return;
  if (!stripe) return res.status(501).json({ error: "Adding funds isn’t set up yet." });
  const dollars = Number(req.body?.amount);
  if (!TOPUP_AMOUNTS.includes(dollars)) return res.status(400).json({ error: "Pick an amount." });

  const origin = process.env.SITE_URL || `https://${req.headers.host}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { kind: "topup", user_id: user.id },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: dollars * 100, product_data: { name: `Bearded Bear pack credit — $${dollars}` } } }],
      success_url: `${origin}/packs?funded=1`,
      cancel_url: `${origin}/packs`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Couldn’t start checkout. Try again." });
  }
}
