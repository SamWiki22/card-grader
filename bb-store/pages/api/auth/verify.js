import { packsReady, verifyCode, setSession, setPassword, MIN_PASSWORD } from "../../../lib/auth";
import { db } from "../../../lib/catalog";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!packsReady()) return res.status(503).json({ error: "Sign-in isn’t set up yet." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").replace(/\s/g, "");
  const password = req.body?.password ? String(req.body.password) : "";
  const reset = req.body?.purpose === "reset";
  if (!reset && req.body?.over18 !== true) return res.status(400).json({ error: "You must be 18 or older to open packs." });
  if (password && password.length < MIN_PASSWORD) return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for your password.` });
  let result;
  try {
    result = await verifyCode(email, code);
  } catch {
    return res.status(400).json({ error: "That code didn’t work — check it or request a new one." });
  }
  const { session, user } = result;
  await db.from("profiles").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true });
  if (!reset) await db.from("profiles").update({ age_confirmed_at: new Date().toISOString() }).eq("user_id", user.id).is("age_confirmed_at", null);
  // New account or "forgot password": the code proved they own the email, so save their password now.
  let passwordSaved = false;
  if (password) {
    try { await setPassword(user.id, password); passwordSaved = true; } catch (e) { console.error(e); }
  }
  setSession(res, session);
  res.json({ ok: true, passwordSaved });
}
