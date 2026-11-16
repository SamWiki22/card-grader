import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { getBalance, BUYBACK_PERCENT, SHIP_FEE_CENTS } from "../../../lib/packs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const user = await requireUser(req, res);
  if (!user) return;
  const [balance, cards, ledger, shipments] = await Promise.all([
    getBalance(user.id, user.email),
    db.from("pack_cards").select("id,tier_id,name,set_name,grade,market_value_cents,status,held_at")
      .eq("owner_id", user.id).in("status", ["held", "ship_requested", "shipped"]).order("held_at", { ascending: false }),
    db.from("ledger").select("id,kind,amount_cents,note,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    db.from("shipments").select("id,card_ids,status,tracking,created_at,shipped_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  res.json({
    balance_cents: balance,
    buyback_percent: BUYBACK_PERCENT,
    ship_fee_cents: SHIP_FEE_CENTS,
    cards: cards.data || [],
    ledger: ledger.data || [],
    shipments: shipments.data || [],
  });
}
