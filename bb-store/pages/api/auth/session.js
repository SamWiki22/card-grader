import { packsReady, sessionFromTokens, setSession } from "../../../lib/auth";
import { db } from "../../../lib/catalog";

// Finishes a sign-in link: /auth/callback posts the tokens from the link here,
// we check them with Supabase and store the session in httpOnly cookies.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!packsReady()) return res.status(503).json({ error: "Sign-in isn’t set up yet." });
  const { access_token, refresh_token } = req.body || {};
  if (!access_token || !refresh_token) return res.status(400).json({ error: "That sign-in link is incomplete." });
  try {
    const { session, user } = await sessionFromTokens(String(access_token), String(refresh_token));
    await db.from("profiles").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true });
    // The 18+ box was ticked before the link was sent.
    await db.from("profiles").update({ age_confirmed_at: new Date().toISOString() }).eq("user_id", user.id).is("age_confirmed_at", null);
    setSession(res, session);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "That sign-in link has expired or was already used. Request a new one." });
  }
}
