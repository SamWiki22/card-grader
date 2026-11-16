import { packsReady, verifyCode, setSession } from "../../../lib/auth";
import { db } from "../../../lib/catalog";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!packsReady()) return res.status(503).json({ error: "Sign-in isn’t set up yet." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").replace(/\s/g, "");
  if (req.body?.over18 !== true) return res.status(400).json({ error: "You must be 18 or older to open packs." });
  let result;
  try {
    result = await verifyCode(email, code);
  } catch {
    return res.status(400).json({ error: "That code didn’t work — check it or request a new one." });
  }
  const { session, user } = result;
  await db.from("profiles").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true });
  await db.from("profiles").update({ age_confirmed_at: new Date().toISOString() }).eq("user_id", user.id).is("age_confirmed_at", null);
  setSession(res, session);
  res.json({ ok: true });
}
