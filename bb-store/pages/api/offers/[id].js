import { db } from "../../../lib/catalog";
import { getOffer, publicOffer, OFFER_HOURS } from "../../../lib/offers";

// Public (by private token): see an offer, accept our counter, or withdraw it.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!db) return res.status(503).end();
  const offer = await getOffer(req.query.id);
  if (!offer) return res.status(404).json({ error: "Offer not found." });
  if (req.method === "GET") return res.json({ offer: publicOffer(offer), contactEmail: process.env.CONTACT_EMAIL || "", checkout: !!process.env.STRIPE_SECRET_KEY });
  if (req.method !== "POST") return res.status(405).end();

  const action = req.body?.action;
  const now = new Date().toISOString();
  let patch, from;
  if (action === "accept-counter") { from = "countered"; patch = { status: "accepted", expires_at: new Date(Date.now() + OFFER_HOURS * 36e5).toISOString() }; }
  else if (action === "decline-counter") { from = "countered"; patch = { status: "declined" }; }
  else if (action === "withdraw") { from = "pending"; patch = { status: "declined", admin_note: "Withdrawn by customer" }; }
  else return res.status(400).json({ error: "Unknown action." });
  const { data } = await db.from("offers").update({ ...patch, updated_at: now }).eq("id", offer.id).eq("status", from).select("id");
  if (!data?.length) return res.status(409).json({ error: "This offer has changed — refresh the page." });
  res.json({ offer: publicOffer(await getOffer(offer.id)) });
}
