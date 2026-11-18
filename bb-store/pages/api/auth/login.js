import { packsReady, passwordLogin, setSession } from "../../../lib/auth";
import { db } from "../../../lib/catalog";

// Shopper log-in with email + password.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  if (!packsReady()) return res.status(503).json({ error: "Sign-in isn’t set up yet." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return res.status(400).json({ error: "Enter your email and password." });
  try {
    const { session, user } = await passwordLogin(email, password);
    await db.from("profiles").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true });
    setSession(res, session);
    res.json({ ok: true });
  } catch (e) {
    if (!e.status) console.error(e);
    await new Promise(r => setTimeout(r, 400));
    res.status(e.status || 500).json({ error: e.status ? e.message : "Couldn’t log in. Try again." });
  }
}
