import { db } from "../../../lib/catalog";

// Streams an item's inventory photo (stored as a data URL in Supabase) as a
// real, cacheable image so listing pages never ship base64 blobs.
export default async function handler(req, res) {
  if (!db) return res.status(404).end();
  const { data, error } = await db.from("items").select("photo,price").eq("id", String(req.query.id)).maybeSingle();
  if (!error && Number(data?.price) > 0 && /^https:\/\//.test(data?.photo || "")) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.redirect(302, data.photo);
  }
  const m = !error && data?.photo && Number(data.price) > 0 && /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(data.photo);
  if (!m) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.status(404).end();
  }
  res.setHeader("Content-Type", m[1]);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
  res.send(Buffer.from(m[2], "base64"));
}
