import { getUser, isAdmin, isStaff, isOwner, packsReady } from "../../../lib/auth";
import { getTeamUser } from "../../../lib/team";
import { getBalance } from "../../../lib/packs";
import { db } from "../../../lib/catalog";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!packsReady()) return res.json({ user: null, team: null, ready: false });
  const [user, teamUser] = await Promise.all([getUser(req, res), getTeamUser(req)]);
  // A username/password team session: admin pages only (no balance or vault).
  const team = teamUser ? { username: teamUser.username, name: teamUser.name, role: teamUser.role, admin: isAdmin(teamUser), staff: isStaff(teamUser) } : null;
  if (!user) {
    const offers = team?.staff ? await db.from("offers").select("id").eq("status", "pending") : { data: [] };
    return res.json({ ready: true, user: null, team, new_customer_offers: (offers.data || []).length });
  }
  const staff = isStaff(user) || !!team?.staff;
  const [balance, offers, customerOffers, prof] = await Promise.all([
    getBalance(user.id, user.email),
    db.from("submissions").select("id").eq("user_id", user.id).eq("status", "offered"),
    staff ? db.from("offers").select("id").eq("status", "pending") : Promise.resolve({ data: [] }),
    db.from("profiles").select("has_password").eq("user_id", user.id).maybeSingle(),
  ]);
  res.json({
    ready: true,
    user: { email: user.email, admin: isAdmin(user), staff: isStaff(user), owner: isOwner(user), has_password: !!prof.data?.has_password },
    team,
    balance_cents: balance,
    pending_offers: (offers.data || []).length,
    new_customer_offers: (customerOffers.data || []).length,
  });
}
