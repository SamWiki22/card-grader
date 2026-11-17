import { getUser, isAdmin, isStaff, packsReady } from "../../../lib/auth";
import { getBalance } from "../../../lib/packs";
import { db } from "../../../lib/catalog";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!packsReady()) return res.json({ user: null, ready: false });
  const user = await getUser(req, res);
  if (!user) return res.json({ user: null, ready: true });
  const staff = isStaff(user);
  const [balance, offers, customerOffers] = await Promise.all([
    getBalance(user.id, user.email),
    db.from("submissions").select("id").eq("user_id", user.id).eq("status", "offered"),
    staff ? db.from("offers").select("id").eq("status", "pending") : Promise.resolve({ data: [] }),
  ]);
  res.json({ ready: true, user: { email: user.email, admin: isAdmin(user), staff: isStaff(user) }, balance_cents: balance, pending_offers: (offers.data || []).length, new_customer_offers: (customerOffers.data || []).length });
}
