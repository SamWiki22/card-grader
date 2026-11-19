import { packsReady, sendCode } from "../../../lib/auth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!packsReady()) return res.status(503).json({ error: "Sign-in isn’t set up yet." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
  // "reset" (forgot password) only works for existing accounts and skips the 18+ box they already ticked.
  const reset = req.body?.purpose === "reset";
  if (!reset && req.body?.over18 !== true) return res.status(400).json({ error: "You must be 18 or older to open packs." });
  const origin = process.env.SITE_URL || `https://${req.headers.host}`;
  try {
    await sendCode(email, `${origin}/auth/callback`, !reset);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    if (reset && /signups? not allowed|not found/i.test(e.message || "")) return res.status(404).json({ error: "There’s no account with that email. Create one instead." });
    res.status(429).json({ error: "Couldn’t send a code right now — wait a minute and try again." });
  }
}
