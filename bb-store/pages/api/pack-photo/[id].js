import { db } from "../../../lib/catalog";

export default async function handler(req, res) {
  if (!db) return res.status(404).end();
  const { data } = await db.from("pack_cards").select("image").eq("id", String(req.query.id)).maybeSingle();
  const img = data?.image || "";
  if (/^https:\/\//.test(img)) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.redirect(302, img);
  }
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(img);
  if (!m) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(404).end();
  }
  res.setHeader("Content-Type", m[1]);
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.send(Buffer.from(m[2], "base64"));
}
