// Server-only: pull fresh TCGplayer market prices for every card set to
// "price from TCGplayer" — pack-pool / vault cards and store singles.
import { db } from "./catalog";
import { setPrices } from "./tcg";

const LINK = "id,tcg_category_id,tcg_group_id,tcg_product_id,tcg_subtype";

export async function refreshPrices() {
  const [cards, items] = await Promise.all([
    db.from("pack_cards").select(`${LINK},market_value_cents`).eq("price_source", "tcgplayer").in("status", ["available", "held", "ship_requested", "retired"]),
    db.from("items").select(`${LINK},price`).eq("price_source", "tcgplayer"),
  ]);
  if (cards.error) throw cards.error;
  if (items.error) throw items.error;

  const rows = [...cards.data.map(r => ({ ...r, kind: "card" })), ...items.data.map(r => ({ ...r, kind: "item" }))]
    .filter(r => r.tcg_category_id && r.tcg_group_id && r.tcg_product_id);

  // One download per set, however many cards come from it.
  const sets = new Map();
  for (const r of rows) {
    const key = `${r.tcg_category_id}/${r.tcg_group_id}`;
    if (!sets.has(key)) sets.set(key, setPrices(r.tcg_category_id, r.tcg_group_id).catch(() => null));
  }

  const now = new Date().toISOString();
  let updated = 0, unchanged = 0, missing = 0;
  for (const r of rows) {
    const prices = (await sets.get(`${r.tcg_category_id}/${r.tcg_group_id}`))?.get(Number(r.tcg_product_id));
    const cents = prices ? (prices[r.tcg_subtype] ?? Object.values(prices)[0]) : null;
    if (cents == null) { missing++; continue; }
    if (r.kind === "card") {
      if (cents === Number(r.market_value_cents)) { unchanged++; continue; }
      await db.from("pack_cards").update({ market_value_cents: cents, price_updated_at: now, updated_at: now }).eq("id", r.id);
    } else {
      if (Math.round(Number(r.price) * 100) === cents) { unchanged++; continue; }
      await db.from("items").update({ price: cents / 100, price_updated_at: now }).eq("id", r.id);
    }
    updated++;
  }
  return { checked: rows.length, updated, unchanged, missing };
}
