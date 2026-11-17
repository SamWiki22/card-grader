import { requireUser } from "../../lib/auth";
import { listSets, searchCards } from "../../lib/tcg";

// TCGplayer lookup for signed-in users (admins pricing cards, players submitting them): ?source=pokemon → sets; ?source=pokemon&group=2848&q=umbreon → cards.
export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const source = String(req.query.source || "");
  try {
    if (!req.query.group) return res.json({ sets: await listSets(source) });
    res.json({ cards: await searchCards(source, Number(req.query.group), String(req.query.q || ""), { sealed: req.query.kind === "sealed" }) });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Couldn’t reach TCGplayer data. Try again in a minute." });
  }
}
