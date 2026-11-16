import { requireUser, friendlyError } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { SHIP_FEE_CENTS } from "../../../lib/packs";

const FIELDS = ["name", "line1", "line2", "city", "state", "zip"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req, res);
  if (!user) return;
  const cards = Array.isArray(req.body?.cards) ? [...new Set(req.body.cards.map(String))].slice(0, 50) : [];
  const a = req.body?.address || {};
  const address = Object.fromEntries(FIELDS.map(f => [f, String(a[f] || "").trim().slice(0, 120)]));
  if (!address.name || !address.line1 || !address.city || !address.state || !address.zip) {
    return res.status(400).json({ error: "Fill in your full shipping address." });
  }
  const { data, error } = await db.rpc("request_shipment", { p_user: user.id, p_cards: cards, p_address: address, p_fee: SHIP_FEE_CENTS });
  if (error) {
    const f = friendlyError(error);
    if (f) return res.status(f.status).json({ error: f.message });
    console.error(error);
    return res.status(500).json({ error: "Couldn’t request shipping. Try again." });
  }
  res.json({ shipment_id: data });
}
