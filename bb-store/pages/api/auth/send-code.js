import { packsReady, sendCode } from "../../../lib/auth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!packsReady()) return res.status(503).json({ error: "Sign-in isn’t set up yet." });
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email." });
  try {
    await sendCode(email);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(429).json({ error: "Couldn’t send a code right now — wait a minute and try again." });
  }
}
