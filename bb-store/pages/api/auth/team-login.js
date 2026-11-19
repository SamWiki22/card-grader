import { packsReady } from "../../../lib/auth";
import { teamLogin, teamCookie } from "../../../lib/team";

// Team sign-in with a username and password (the hidden 5-tap logo login).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  if (!packsReady()) return res.status(503).json({ error: "Not set up yet." });
  try {
    const m = await teamLogin(req.body?.username, req.body?.password);
    res.setHeader("Set-Cookie", teamCookie(m));
    res.json({ ok: true, role: m.role, username: m.username });
  } catch (e) {
    if (!e.status) console.error(e);
    // Slow down guessing a little on every failure.
    await new Promise(r => setTimeout(r, 400));
    res.status(e.status || 500).json({ error: e.status ? e.message : "Couldn’t sign in. Try again." });
  }
}
