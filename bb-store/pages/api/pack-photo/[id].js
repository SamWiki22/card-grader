import { db } from "../../../lib/catalog";

// Streams a pack card's photo. Photos are stored as data URLs (or https links,
// e.g. TCGplayer images). ?inline=1 fetches a linked image and serves it from
// this site, so the admin preview generator can draw it on a canvas.
const MAX_BYTES = 5_000_000;

export default async function handler(req, res) {
  if (!db) return res.status(404).end();
  const { data } = await db.from("pack_cards").select("image").eq("id", String(req.query.id)).maybeSingle();
  const img = data?.image || "";
  if (/^https:\/\//.test(img)) {
    if (req.query.inline) {
      try {
        const r = await fetch(img, { signal: AbortSignal.timeout(8000) });
        const type = r.headers.get("content-type") || "";
        const buf = r.ok && /^image\/(jpeg|png|webp|gif)/.test(type) ? Buffer.from(await r.arrayBuffer()) : null;
        if (buf && buf.length <= MAX_BYTES) {
          res.setHeader("Content-Type", type);
          res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
          return res.send(buf);
        }
      } catch (e) { console.error("pack-photo inline", e.message); }
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(404).end();
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.redirect(302, img);
  }
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(img);
  if (!m) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(404).end();
  }
  res.setHeader("Content-Type", m[1]);
  // Short CDN cache so a replaced photo shows up for players within the hour.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(Buffer.from(m[2], "base64"));
}
