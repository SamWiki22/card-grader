// Server-only: pack tiers, live pools and odds.
import { db } from "./catalog";

// Buyback schedule from the buyback_rules table: [{ min_value_cents, percent }], lowest first.
export async function getBuybackRules() {
  if (!db) return [{ min_value_cents: 0, percent: 75 }];
  const { data, error } = await db.from("buyback_rules").select("min_value_cents,percent").order("min_value_cents");
  if (error) throw error;
  return data.length ? data.map(r => ({ min_value_cents: Number(r.min_value_cents), percent: r.percent })) : [{ min_value_cents: 0, percent: 75 }];
}

// Same rule as the database's buyback_percent_for(): a card's own override wins,
// otherwise the highest rule whose minimum the card's value reaches.
export function buybackPercent(valueCents, override, rules) {
  if (override != null) return override;
  let pct = rules[0]?.percent ?? 75;
  for (const r of rules) if (valueCents >= r.min_value_cents) pct = r.percent;
  return pct;
}
export const buybackCents = (valueCents, pct) => Math.floor(valueCents * pct / 100);
export const SHIP_FEE_CENTS = Math.max(0, Number(process.env.VAULT_SHIP_FEE_CENTS) || 0);

const CARD_COLUMNS = "id,tier_id,name,set_name,grade,market_value_cents,weight";

// Value bands relative to the pack price, like "most pulls land near the price,
// a few hit big". Labels use the real min/max of the cards in each band.
const BAND_EDGES = [0, 0.6, 1.2, 3, 10, Infinity];

export function oddsFor(cards, priceCents) {
  const total = cards.reduce((s, c) => s + Number(c.weight), 0);
  if (!total) return [];
  const bands = BAND_EDGES.slice(0, -1).map((lo, i) => ({ lo: lo * priceCents, hi: BAND_EDGES[i + 1] * priceCents, cards: [] }));
  for (const c of cards) bands.find(b => c.market_value_cents >= b.lo && c.market_value_cents < b.hi).cards.push(c);
  return bands.map((b, band) => ({ ...b, band })).filter(b => b.cards.length).map(b => {
    const values = b.cards.map(c => c.market_value_cents);
    return {
      band: b.band,                    // 0 = cheapest range … 4 = chase range
      minCents: Math.min(...values),
      maxCents: Math.max(...values),
      count: b.cards.length,
      chance: b.cards.reduce((s, c) => s + Number(c.weight), 0) / total,
    };
  });
}

// Expected value per opening, for the admin margin check.
export function expectedValue(cards) {
  const total = cards.reduce((s, c) => s + Number(c.weight), 0);
  return total ? cards.reduce((s, c) => s + Number(c.weight) * c.market_value_cents, 0) / total : 0;
}

export async function listTiers({ includeInactive = false } = {}) {
  let q = db.from("pack_tiers").select("*").order("game").order("sort");
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function poolCards(tierIds) {
  if (!tierIds.length) return [];
  const { data, error } = await db.from("pack_cards").select(CARD_COLUMNS).in("tier_id", tierIds).eq("status", "available");
  if (error) throw error;
  return data;
}

// Everything the public /packs page needs: tiers grouped by game, each with its
// odds table and showcase cards. Weights and EV stay server-side.
export async function packsOverview() {
  const tiers = await listTiers();
  const cards = await poolCards(tiers.map(t => t.id));
  return tiers.map(t => {
    const pool = cards.filter(c => c.tier_id === t.id);
    const showcase = [...pool].sort((a, b) => b.market_value_cents - a.market_value_cents).slice(0, 12)
      .map(({ id, name, set_name, grade, market_value_cents }) => ({ id, name, set_name, grade, market_value_cents }));
    return { id: t.id, game: t.game, name: t.name, price_cents: Number(t.price_cents), color: t.color, poolSize: pool.length, odds: oddsFor(pool, Number(t.price_cents)), showcase };
  });
}

export async function getBalance(userId, email) {
  await db.from("profiles").upsert({ user_id: userId, email: email || "" }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data } = await db.from("profiles").select("balance_cents").eq("user_id", userId).maybeSingle();
  return Number(data?.balance_cents) || 0;
}
