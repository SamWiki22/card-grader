// Server-only: find the card number for cards that were listed without one,
// using TCGplayer's catalog (via tcgcsv.com). Nothing here writes to the database.

import { TCG_SOURCES } from "./shared";

const BASE = "https://tcgcsv.com/tcgplayer";
const cache = new Map(); // path -> { at, data }
const HOURS_12 = 12 * 60 * 60 * 1000;

async function get(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < HOURS_12) return hit.data;
  const r = await fetch(BASE + path, { headers: { "User-Agent": "BeardedBearTCG/1.0 (+card numbers)" } });
  if (!r.ok) throw new Error(`TCGplayer data unavailable (${r.status})`);
  const data = (await r.json()).results || [];
  cache.set(path, { at: Date.now(), data });
  return data;
}

const ext = (p, key) => (p.extendedData || []).find(e => e.name === key)?.value || "";
export const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const base = s => norm(String(s || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+-\s+\S+$/, ""));

const setKey = s => norm(String(s || "").replace(/\([^)]*\)/g, " ").replace(/^[^:]{1,12}:\s*/, ""));

// Does this name already carry a card number? ("223/197", "#12", "BT1-031", "OP01-016", "FB01-001", "SV049", "123")
export function hasNumber(name) {
  const s = String(name || "");
  return /\b\d{1,4}\s*\/\s*\d{1,4}\b/.test(s) || /#\s*\w+/.test(s) || /\b[A-Z]{1,6}\d{0,3}[A-Z]?-[A-Z]?\d{2,4}[A-Z]?\b/i.test(s) || /\b[A-Z]{2,4}\d{2,4}\b/.test(s) || /\s\d{1,4}[a-z]?$/i.test(s.trim());
}

// Card number goes after the name, like the rest of the store ("Lightning Bolt 141").
export const withNumber = (name, number) => `${String(name).trim()} ${number}`;

const sourcesFor = game => TCG_SOURCES.filter(s => s.game === game);

async function groupsFor(game) {
  const out = [];
  for (const s of sourcesFor(game)) for (const g of await get(`/${s.categoryId}/groups`)) out.push({ cat: s.categoryId, groupId: g.groupId, name: g.name, abbr: g.abbreviation || "" });
  return out;
}

async function products(cat, groupId) {
  return (await get(`/${cat}/${groupId}/products`)).filter(p => ext(p, "Number")); // singles only
}

// rows: [{ id, name, set_name, game, tcg_category_id, tcg_group_id, tcg_product_id }]
// Returns { found: [{ id, from, to, number, set }], choose: [{ id, from, set, options: [{ number, label, to }] }], skipped: [{ id, name, why }] }
// Stops early (done: false) when it runs out of time so the phone can ask for the rest.
export async function findNumbers(rows, { deadline = Date.now() + 8000 } = {}) {
  const found = [], choose = [], skipped = [];
  const groupCache = new Map();
  let i = 0;
  for (; i < rows.length; i++) {
    if (Date.now() > deadline) break;
    const r = rows[i];
    try {
      // 1. Already linked to TCGplayer: read the number straight off the product.
      if (r.tcg_product_id && r.tcg_group_id && r.tcg_category_id) {
        const p = (await products(r.tcg_category_id, r.tcg_group_id)).find(x => x.productId === Number(r.tcg_product_id));
        if (p) { found.push({ id: r.id, from: r.name, to: withNumber(r.name, ext(p, "Number")), number: ext(p, "Number"), set: r.set_name }); continue; }
      }
      if (!sourcesFor(r.game).length) { skipped.push({ id: r.id, name: r.name, why: "game not on TCGplayer" }); continue; }
      if (!r.set_name) { skipped.push({ id: r.id, name: r.name, why: "no set listed" }); continue; }

      // 2. Match the set by name (or its code, e.g. "MH3"), then the card by name.
      if (!groupCache.has(r.game)) groupCache.set(r.game, await groupsFor(r.game));
      const want = norm(r.set_name);
      const all = groupCache.get(r.game);
      let sets = all.filter(g => norm(g.name) === want || (g.abbr && norm(g.abbr) === want));
      // Looser: ignore "(M10)" codes and "SV03:" style prefixes on either side.
      if (!sets.length) { const w = setKey(r.set_name); sets = all.filter(g => setKey(g.name) === w); }
      if (!sets.length) { skipped.push({ id: r.id, name: r.name, why: `set “${r.set_name}” not found on TCGplayer` }); continue; }

      const full = norm(r.name), plain = base(r.name);
      let hits = [];
      for (const g of sets) {
        const ps = await products(g.cat, g.groupId);
        const exact = ps.filter(p => norm(p.name) === full);
        hits.push(...(exact.length ? exact : ps.filter(p => base(p.name) === plain)).map(p => ({ number: ext(p, "Number"), label: p.name, rarity: ext(p, "Rarity") })));
      }
      // Same number listed twice (e.g. foil/non-foil products) counts once.
      const byNum = new Map();
      for (const h of hits) if (!byNum.has(h.number)) byNum.set(h.number, h);
      hits = [...byNum.values()];

      if (hits.length === 1) found.push({ id: r.id, from: r.name, to: withNumber(r.name, hits[0].number), number: hits[0].number, set: r.set_name });
      else if (hits.length > 1) choose.push({ id: r.id, from: r.name, set: r.set_name, options: hits.slice(0, 12).map(h => ({ number: h.number, label: `${h.label} · #${h.number}${h.rarity ? ` · ${h.rarity}` : ""}`, to: withNumber(r.name, h.number) })) });
      else skipped.push({ id: r.id, name: r.name, why: `no card by that name in ${r.set_name}` });
    } catch (e) {
      skipped.push({ id: r.id, name: r.name, why: e.message });
    }
  }
  return { found, choose, skipped, next: i, done: i >= rows.length };
}
