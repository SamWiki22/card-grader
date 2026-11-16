import { requireAdmin } from "../../../lib/auth";
import { listSets, searchCards } from "../../../lib/tcg";

// Admin TCGplayer lookup: ?game=pokemon → sets; ?game=pokemon&group=2848&q=umbreon → cards.
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const game = String(req.query.game || "");
  try {
    if (!req.query.group) return res.json({ sets: await listSets(game) });
    res.json({ cards: await searchCards(game, Number(req.query.group), String(req.query.q || "")) });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Couldn’t reach TCGplayer data. Try again in a minute." });
  }
}
