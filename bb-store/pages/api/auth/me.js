import { getUser, isAdmin, packsReady } from "../../../lib/auth";
import { getBalance } from "../../../lib/packs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!packsReady()) return res.json({ user: null, ready: false });
  const user = await getUser(req, res);
  if (!user) return res.json({ user: null, ready: true });
  res.json({ ready: true, user: { email: user.email, admin: isAdmin(user) }, balance_cents: await getBalance(user.id, user.email) });
}
