import { requireUser, setPassword, MIN_PASSWORD } from "../../../lib/auth";

// Signed-in shopper sets or changes their password.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req, res);
  if (!user) return;
  const password = String(req.body?.password || "");
  if (password.length < MIN_PASSWORD) return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters.` });
  try {
    await setPassword(user.id, password);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message?.includes("weak") ? "That password is too easy to guess. Try a longer one." : "Couldn’t save that password. Try again." });
  }
}
