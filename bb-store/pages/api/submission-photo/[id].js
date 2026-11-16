import { getUser, isAdmin } from "../../../lib/auth";
import { db } from "../../../lib/catalog";

// A submission's photo — visible only to the player who sent it and to admins.
export default async function handler(req, res) {
  const user = await getUser(req, res);
  if (!user) return res.status(401).end();
  const side = req.query.side === "back" ? "photo_back" : "photo_front";
  const { data } = await db.from("submissions").select(`user_id,${side}`).eq("id", String(req.query.id)).maybeSingle();
  if (!data || (data.user_id !== user.id && !isAdmin(user))) return res.status(404).end();
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(data[side] || "");
  if (!m) return res.status(404).end();
  res.setHeader("Content-Type", m[1]);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(Buffer.from(m[2], "base64"));
}
