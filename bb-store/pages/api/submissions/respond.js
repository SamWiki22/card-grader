import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/catalog";

// Player accepts or declines our offer on one of their submissions.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req, res);
  if (!user) return;
  const status = req.body?.accept ? "accepted" : "declined";
  const { data, error } = await db.from("submissions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", String(req.body?.id || "")).eq("user_id", user.id).eq("status", "offered")
    .select("id");
  if (error) { console.error(error); return res.status(500).json({ error: "Couldn’t save that. Try again." }); }
  if (!data?.length) return res.status(409).json({ error: "That offer isn’t open anymore." });
  res.json({ ok: true, status });
}
