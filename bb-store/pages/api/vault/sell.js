import { requireUser, friendlyError } from "../../../lib/auth";
import { db } from "../../../lib/catalog";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req, res);
  if (!user) return;
  // to: "pool" (default) = back into its pack pool; "store" = Bearded Bear buys it for the store.
  const toStore = req.body?.to === "store";
  const { data, error } = await db.rpc(toStore ? "sell_to_store" : "sell_back", { p_user: user.id, p_card: String(req.body?.card || "") });
  if (error) {
    const f = friendlyError(error);
    if (f) return res.status(f.status).json({ error: f.message });
    console.error(error);
    return res.status(500).json({ error: "Couldn’t sell that card back. Try again." });
  }
  res.json(data);
}
