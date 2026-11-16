import { requireUser, friendlyError } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { BUYBACK_PERCENT } from "../../../lib/packs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req, res);
  if (!user) return;
  const { data, error } = await db.rpc("sell_back", { p_user: user.id, p_card: String(req.body?.card || ""), p_percent: BUYBACK_PERCENT });
  if (error) {
    const f = friendlyError(error);
    if (f) return res.status(f.status).json({ error: f.message });
    console.error(error);
    return res.status(500).json({ error: "Couldn’t sell that card back. Try again." });
  }
  res.json(data);
}
