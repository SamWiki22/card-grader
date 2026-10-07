import { limitlessFetch } from "../../../lib/limitless";

// GET /api/meta/tournaments?game=PTCG&format=STANDARD&limit=25
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const game = String(req.query.game || "").toUpperCase();
  if (!/^[A-Z0-9_]{1,20}$/.test(game)) return res.status(400).json({ error: "Bad game code" });
  const format = String(req.query.format || "").toUpperCase();
  if (format && !/^[A-Z0-9_]{1,30}$/.test(format)) return res.status(400).json({ error: "Bad format" });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 50);
  try {
    const list = await limitlessFetch("/tournaments", { game, format, limit });
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    return res.status(200).json({
      tournaments: (Array.isArray(list) ? list : []).map(t => ({
        id: t.id,
        name: t.name,
        date: t.date,
        format: t.format || "",
        players: t.players ?? null,
      })),
    });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
