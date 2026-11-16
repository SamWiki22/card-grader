import { refreshPrices } from "../../../lib/prices";
import { db } from "../../../lib/catalog";

// Daily TCGplayer price sync. Vercel Cron calls this (see vercel.json) and
// sends "Authorization: Bearer $CRON_SECRET" automatically when CRON_SECRET is set.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).end();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    res.json(await refreshPrices());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
