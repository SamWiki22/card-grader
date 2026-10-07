import { limitlessFetch, normalizeStanding } from "../../../lib/limitless";

// GET /api/meta/standings?id=<tournamentId>&top=16 — top finishers with their decklists.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const id = String(req.query.id || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return res.status(400).json({ error: "Bad tournament id" });
  const top = Math.min(Math.max(parseInt(req.query.top, 10) || 16, 1), 64);
  try {
    const [details, standings] = await Promise.all([
      limitlessFetch(`/tournaments/${id}/details`).catch(() => null),
      limitlessFetch(`/tournaments/${id}/standings`),
    ]);
    const players = (Array.isArray(standings) ? standings : [])
      .map(normalizeStanding)
      .filter(s => s.cards.length)
      .sort((a, b) => (a.placing ?? 1e9) - (b.placing ?? 1e9))
      .slice(0, top);
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({
      tournament: details ? { id, name: details.name, date: details.date, format: details.format || "" } : { id },
      url: `https://play.limitlesstcg.com/tournament/${id}/standings`,
      players,
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
