// Server-only: TCGplayer catalog + market prices via tcgcsv.com, a free daily
// mirror of TCGplayer's data (TCGplayer no longer issues new API keys).
// Data refreshes once a day around 20:00 UTC.

const BASE = "https://tcgcsv.com/tcgplayer";

import { TCG_SOURCES } from "./shared";
export { TCG_SOURCES };
const sourceCat = id => TCG_SOURCES.find(s => s.id === id)?.categoryId;

const cache = new Map(); // path -> { at, data }

async function get(path, ttlMs) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const r = await fetch(BASE + path, { headers: { "User-Agent": "BeardedBearTCG/1.0 (+store price sync)" } });
  if (!r.ok) throw new Error(`TCGplayer data unavailable (${r.status})`);
  const json = await r.json();
  const data = json.results || [];
  cache.set(path, { at: Date.now(), data });
  return data;
}

const HOUR = 60 * 60 * 1000;
const toCents = n => (n == null ? null : Math.round(Number(n) * 100));
const ext = (p, key) => (p.extendedData || []).find(e => e.name === key)?.value || "";

// Sets for a game, newest first.
export async function listSets(sourceId) {
  const cat = sourceCat(sourceId);
  if (!cat) return [];
  const groups = await get(`/${cat}/groups`, 12 * HOUR);
  // Real release dates look like "2021-08-27T00:00:00"; sets with no date get
  // the feed's own timestamp instead, so treat those as undated (listed last).
  const released = g => (/T00:00:00$/.test(g.publishedOn || "") ? g.publishedOn : "");
  return groups
    .map(g => ({ groupId: g.groupId, name: g.name, abbreviation: g.abbreviation || "", publishedOn: released(g) }))
    .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn) || a.name.localeCompare(b.name));
}

// productId -> { subType -> marketCents } for one set.
export async function setPrices(categoryId, groupId) {
  const rows = await get(`/${categoryId}/${groupId}/prices`, HOUR);
  const out = new Map();
  for (const r of rows) {
    const cents = toCents(r.marketPrice ?? r.midPrice ?? r.lowPrice);
    if (cents == null) continue;
    if (!out.has(r.productId)) out.set(r.productId, {});
    out.get(r.productId)[r.subTypeName || "Normal"] = cents;
  }
  return out;
}

// Single cards in a set matching a search, each with its price per printing.
export async function searchCards(sourceId, groupId, q, { sealed = false } = {}) {
  const cat = sourceCat(sourceId);
  if (!cat || !groupId) return [];
  const [products, prices] = await Promise.all([get(`/${cat}/${groupId}/products`, 12 * HOUR), setPrices(cat, groupId)]);
  const terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  return products
    .filter(p => (sealed ? !ext(p, "Number") : !!ext(p, "Number"))) // singles have a card number; sealed product doesn't
    .filter(p => terms.every(t => `${p.name} ${ext(p, "Number")}`.toLowerCase().includes(t)))
    .slice(0, 60)
    .map(p => ({
      categoryId: cat,
      groupId: p.groupId,
      productId: p.productId,
      name: p.name,
      number: ext(p, "Number"),
      rarity: ext(p, "Rarity"),
      imageUrl: p.imageUrl,
      url: p.url,
      prices: Object.entries(prices.get(p.productId) || {}).map(([subType, cents]) => ({ subType, cents })),
    }));
}

// Market price (cents) for one linked card, or null if TCGplayer has none.
export async function marketCents(categoryId, groupId, productId, subType) {
  const prices = (await setPrices(categoryId, groupId)).get(Number(productId)) || {};
  return prices[subType] ?? Object.values(prices)[0] ?? null;
}
