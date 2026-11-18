import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { getBalance, getBuybackRules, buybackPercent, buybackCents, SHIP_FEE_CENTS } from "../../../lib/packs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const user = await requireUser(req, res);
  if (!user) return;
  const [balance, cards, ledger, shipments, rules, incoming] = await Promise.all([
    getBalance(user.id, user.email),
    db.from("pack_cards").select("id,tier_id,name,set_name,grade,market_value_cents,buyback_percent,status,held_at,price_source,comp_cents,comp_source,comp_date,comp_url")
      .eq("owner_id", user.id).in("status", ["held", "ship_requested", "shipped"]).order("held_at", { ascending: false }),
    db.from("ledger").select("id,kind,amount_cents,note,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    db.from("shipments").select("id,card_ids,status,tracking,created_at,shipped_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    getBuybackRules(),
    // Cards they're mailing in to keep: shown locked until we check them in.
    db.from("submissions").select("id,game,name,set_name,card_number,grade,created_at").eq("user_id", user.id).eq("kind", "vault").eq("status", "accepted").order("created_at", { ascending: false }),
  ]);
  res.json({
    balance_cents: balance,
    ship_fee_cents: SHIP_FEE_CENTS,
    cards: (cards.data || []).map(({ buyback_percent, ...c }) => {
      const pct = buybackPercent(c.market_value_cents, buyback_percent, rules);
      return { ...c, buyback_percent: pct, buyback_cents: buybackCents(c.market_value_cents, pct) };
    }),
    ledger: ledger.data || [],
    shipments: shipments.data || [],
    incoming: incoming.data || [],
    shipTo: (process.env.SHOP_ADDRESS || "").split("|").map(x => x.trim()).filter(Boolean),
  });
}
