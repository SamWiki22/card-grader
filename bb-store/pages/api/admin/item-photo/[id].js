import { requireAdmin } from "../../../../lib/auth";
import { db } from "../../../../lib/catalog";

// An item's photo for the admin editor — any item, listed or not, never cached.
export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { data } = await db.from("items").select("photo").eq("id", String(req.query.id)).maybeSingle();
  const photo = data?.photo || "";
  res.setHeader("Cache-Control", "no-store");
  if (/^https:\/\//.test(photo)) return res.redirect(302, photo);
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(photo);
  if (!m) return res.status(404).end();
  res.setHeader("Content-Type", m[1]);
  res.send(Buffer.from(m[2], "base64"));
}
