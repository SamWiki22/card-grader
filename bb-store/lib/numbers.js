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

const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
// A card number typed where the set should be ("OP17-070", "BT1-031", "FB01-001").
export const isCode = s => /^[A-Z]{1,5}\d{0,3}[A-Z]?-[A-Z]?\d{2,4}[A-Z]?$/i.test(String(s || "").trim());

// Does this name already carry a card number? ("223/197", "#12", "BT1-031", "OP01-016", "FB01-001", "SV049", "123")
export function hasNumber(name) {
  const s = String(name || "");
  return /\b\d{1,4}\s*\/\s*\d{1,4}\b/.test(s) || /#\s*\w+/.test(s) || /\b[A-Z]{1,6}\d{0,3}[A-Z]?-[A-Z]?\d{2,4}[A-Z]?\b/i.test(s) || /\b[A-Z]{2,4}\d{2,4}\b/.test(s) || /\s\d{1,4}[a-z]?$/i.test(s.trim());
}

// Card number goes after the name, like the rest of the store ("Lightning Bolt 141").
export const withNumber = (name, number) => `${String(name).trim()} ${number}`;

const sourcesFor = game => TCG_SOURCES.filter(s => s.game === game);
const groupCacheAll = new Map();
async function groupsCached(game) {
  const hit = groupCacheAll.get(game);
  if (hit && Date.now() - hit.at < HOURS_12) return hit.data;
  const data = await groupsFor(game);
  groupCacheAll.set(game, { at: Date.now(), data });
  return data;
}

async function groupsFor(game) {
  const out = [];
  for (const s of sourcesFor(game)) for (const g of await get(`/${s.categoryId}/groups`)) out.push({ cat: s.categoryId, groupId: g.groupId, name: g.name, abbr: g.abbreviation || "" });
  return out;
}

async function products(cat, groupId) {
  return (await get(`/${cat}/${groupId}/products`)).filter(p => ext(p, "Number")); // singles only
}

// A card code inside a name ("Scratchmen Apoo OP17-070") and the name without it.
const CODE_IN_NAME = /\s+#?([A-Z]{1,5}\d{0,3}[A-Z]?-[A-Z]?\d{2,4}[A-Z]?)$/i;
// A plain trailing number ("Lightning Bolt 146", "Charizard ex 223/197").
const NUM_IN_NAME = /\s+#?(\d{1,4}[a-z]?(?:\s*\/\s*\d{1,4})?)$/i;
const numKey = s => String(s || "").split("/")[0].trim().replace(/^0+(?=\d)/, "").toLowerCase();
const isMainSet = g => !/\bRE\b|release event/i.test(`${g.abbr} ${g.name}`);

// rows: [{ id, name, set_name, game, rarity?, tcg_category_id, tcg_group_id, tcg_product_id }]
// Fills in what's missing: the card number (after the name), the real set name when a card
// number was typed in the Set box, and the rarity (when withRarity).
// Returns { found: [{ id, from, to, number, set, fromSet?, toSet?, rarity? }],
//           choose: [{ id, from, set, options: [{ number, label, to, toSet?, rarity? }] }],
//           skipped: [{ id, name, why }] }
// Stops early (done: false) when it runs out of time so the phone can ask for the rest.
export async function findNumbers(rows, { deadline = Date.now() + 8000, withRarity = false } = {}) {
  const found = [], choose = [], skipped = [];
  const groupCache = new Map();
  const groups = async game => { if (!groupCache.has(game)) groupCache.set(game, await groupsFor(game)); return groupCache.get(game); };
  const wantRarity = r => withRarity && !String(r.rarity || "").trim();

  // One match: record only what actually changes.
  function hit(r, { to = r.name, number, set = r.set_name, toSet, rarity, moved }) {
    const rar = wantRarity(r) && rarity ? rarity : "";
    if (to === r.name && !toSet && !rar) return skipped.push({ id: r.id, name: r.name, why: "TCGplayer has nothing new for this card" });
    found.push({ id: r.id, from: r.name, to, number, set, ...(toSet ? { fromSet: r.set_name, toSet } : {}), ...(rar ? { rarity: rar } : {}), ...(moved ? { moved: true } : {}) });
  }

  // Look a card up by its code (OP17-070, FB01-001, BT1-031…) across the game's sets.
  async function byCode(r, code, nameBase, fixSet) {
    const prefix = squash(code.split("-")[0]);
    const all = await groups(r.game);
    let gs = all.filter(g => g.abbr && squash(g.abbr).startsWith(prefix));
    if (!gs.length) gs = all;
    const hits = [];
    for (const g of gs) {
      if (Date.now() > deadline + 4000) break;
      for (const p of await products(g.cat, g.groupId)) if (ext(p, "Number").toUpperCase() === code) hits.push({ p, g });
    }
    const mine = hits.filter(h => norm(h.p.name) === norm(nameBase));
    const same = mine.length ? mine : hits.filter(h => base(h.p.name) === base(nameBase));
    const main = same.filter(h => isMainSet(h.g));
    const pickFrom = main.length ? main : same;
    const name = hasNumber(r.name) ? r.name : withNumber(r.name, code);
    const sets = [...new Set(pickFrom.map(h => h.g.name))];
    if (sets.length === 1) {
      const p = pickFrom[0].p;
      return hit(r, { to: name, number: code, set: fixSet ? sets[0] : r.set_name, toSet: fixSet ? sets[0] : undefined, rarity: ext(p, "Rarity"), moved: fixSet });
    }
    if (hits.length) {
      const opts = [...new Map(hits.map(h => [`${h.g.groupId}|${h.p.name}`, h])).values()].slice(0, 12);
      return choose.push({ id: r.id, from: r.name, fromSet: fixSet ? r.set_name : undefined, set: r.set_name, options: opts.map(h => ({
        number: `${code}|${h.g.groupId}|${h.p.productId}`, label: `${h.p.name} · ${h.g.name}${ext(h.p, "Rarity") ? ` · ${ext(h.p, "Rarity")}` : ""}`,
        to: name, ...(fixSet ? { toSet: h.g.name } : {}), ...(wantRarity(r) && ext(h.p, "Rarity") ? { rarity: ext(h.p, "Rarity") } : {}),
      })) });
    }
    return skipped.push({ id: r.id, name: r.name, why: `card number ${code} not found on TCGplayer` });
  }

  let i = 0;
  for (; i < rows.length; i++) {
    if (Date.now() > deadline) break;
    const r = rows[i];
    try {
      // 1. Already linked to TCGplayer: read it straight off the product.
      if (r.tcg_product_id && r.tcg_group_id && r.tcg_category_id) {
        const p = (await products(r.tcg_category_id, r.tcg_group_id)).find(x => x.productId === Number(r.tcg_product_id));
        if (p) { hit(r, { to: hasNumber(r.name) ? r.name : withNumber(r.name, ext(p, "Number")), number: ext(p, "Number"), rarity: ext(p, "Rarity") }); continue; }
      }
      if (!sourcesFor(r.game).length) { skipped.push({ id: r.id, name: r.name, why: "game not on TCGplayer" }); continue; }

      // 2. Card number typed in the Set box ("OP17-070"): move it after the name, fill in the real set.
      if (isCode(r.set_name)) { await byCode(r, r.set_name.trim().toUpperCase(), r.name, true); continue; }

      // 3. Card code already in the name ("Scratchmen Apoo OP17-070").
      const inName = r.name.match(CODE_IN_NAME);
      if (inName) { await byCode(r, inName[1].toUpperCase(), r.name.replace(CODE_IN_NAME, ""), !r.set_name); continue; }

      if (!r.set_name) { skipped.push({ id: r.id, name: r.name, why: "no set listed" }); continue; }

      // 4. Match the set by name (or its code, e.g. "MH3"), then the card.
      const all = await groups(r.game);
      const want = norm(r.set_name);
      let sets = all.filter(g => norm(g.name) === want || (g.abbr && norm(g.abbr) === want));
      // Looser: ignore "(M10)" codes and "SV03:" style prefixes on either side.
      if (!sets.length) { const w = setKey(r.set_name); sets = all.filter(g => setKey(g.name) === w); }
      if (!sets.length) { skipped.push({ id: r.id, name: r.name, why: `set “${r.set_name}” not found on TCGplayer` }); continue; }

      // Name already ends in a number ("Lightning Bolt 146"): match name + number.
      const numMatch = hasNumber(r.name) ? r.name.match(NUM_IN_NAME) : null;
      const nameBase = numMatch ? r.name.replace(NUM_IN_NAME, "") : r.name;
      const full = norm(nameBase), plain = base(nameBase);
      let hits = [];
      for (const g of sets) {
        const ps = await products(g.cat, g.groupId);
        let mine = ps.filter(p => norm(p.name) === full);
        if (!mine.length) mine = ps.filter(p => base(p.name) === plain);
        if (numMatch) mine = mine.filter(p => numKey(ext(p, "Number")) === numKey(numMatch[1]));
        hits.push(...mine.map(p => ({ number: ext(p, "Number"), label: p.name, rarity: ext(p, "Rarity") })));
      }
      // Same number listed twice (e.g. foil/non-foil products) counts once.
      const byNum = new Map();
      for (const h of hits) if (!byNum.has(h.number)) byNum.set(h.number, h);
      hits = [...byNum.values()];
      const named = n => (numMatch ? r.name : withNumber(r.name, n));

      if (hits.length === 1) hit(r, { to: named(hits[0].number), number: hits[0].number, rarity: hits[0].rarity });
      else if (hits.length > 1) choose.push({ id: r.id, from: r.name, set: r.set_name, options: hits.slice(0, 12).map(h => ({
        number: h.number, label: `${h.label} · #${h.number}${h.rarity ? ` · ${h.rarity}` : ""}`, to: named(h.number), ...(wantRarity(r) && h.rarity ? { rarity: h.rarity } : {}),
      })) });
      else skipped.push({ id: r.id, name: r.name, why: `no card by that name${numMatch ? ` and number` : ""} in ${r.set_name}` });
    } catch (e) {
      skipped.push({ id: r.id, name: r.name, why: e.message });
    }
  }
  return { found, choose, skipped, next: i, done: i >= rows.length };
}

// ── Match one card read from a photo to a TCGplayer product ─────────────────
// card: { game, name, set, number, foil }. Returns null, or
// { categoryId, groupId, productId, subType, name, number, rarity, setName, imageUrl, cents }.
export async function matchCard(card) {
  const game = card.game;
  if (!sourcesFor(game).length || !card.name) return null;
  const all = await groupsCached(game);
  const number = String(card.number || "").trim();
  const code = isCode(number) ? number.toUpperCase() : (String(card.name).match(CODE_IN_NAME)?.[1] || "").toUpperCase();
  const nameBase = String(card.name).replace(CODE_IN_NAME, "").replace(NUM_IN_NAME, "");
  let hits = [];

  if (code) {
    // Card codes (OP17-070, FB01-001, BT1-031) are unique across the game: search the sets with that prefix.
    const prefix = squash(code.split("-")[0]);
    let gs = all.filter(g => g.abbr && squash(g.abbr).startsWith(prefix));
    if (!gs.length) gs = all.filter(g => setKey(g.name) === setKey(card.set));
    for (const g of gs.slice(0, 12)) for (const p of await products(g.cat, g.groupId)) if (ext(p, "Number").toUpperCase() === code) hits.push({ p, g });
  } else if (card.set) {
    const want = norm(card.set);
    let gs = all.filter(g => norm(g.name) === want || (g.abbr && norm(g.abbr) === want));
    if (!gs.length) gs = all.filter(g => setKey(g.name) === setKey(card.set));
    if (!gs.length) gs = all.filter(g => setKey(g.name).includes(setKey(card.set)) || setKey(card.set).includes(setKey(g.name))).slice(0, 4);
    for (const g of gs) {
      for (const p of await products(g.cat, g.groupId)) {
        const sameNum = number && numKey(ext(p, "Number")) === numKey(number);
        const sameName = base(p.name) === base(nameBase) || norm(p.name) === norm(nameBase);
        // Set + collector number pins the card even if the name was misread or misspelled.
        if (number ? sameNum : sameName) hits.push({ p, g });
      }
    }
  }
  if (!hits.length) return null;
  // Prefer the exact name, then the plain (non-variant) printing, then the main set over promo/event sets.
  const rank = h => (norm(h.p.name) === norm(nameBase) ? 0 : base(h.p.name) === base(nameBase) ? 1 : 2) * 10 + (isMainSet(h.g) ? 0 : 5) + (/\(/.test(h.p.name) ? 1 : 0);
  hits.sort((a, b) => rank(a) - rank(b));
  const { p, g } = hits[0];
  const prices = (await get(`/${g.cat}/${g.groupId}/prices`)).filter(r => r.productId === p.productId);
  const want = card.foil ? /foil|holo/i : /^normal$/i;
  const row = prices.find(r => want.test(r.subTypeName || "")) || prices.find(r => !card.foil && !/foil|holo/i.test(r.subTypeName || "")) || prices[0];
  const cents = row ? Math.round(Number(row.marketPrice ?? row.midPrice ?? row.lowPrice ?? 0) * 100) || null : null;
  return {
    categoryId: g.cat, groupId: g.groupId, productId: p.productId, subType: row?.subTypeName || "Normal",
    name: p.name.replace(/\s+-\s+\S+$/, ""), number: ext(p, "Number"), rarity: ext(p, "Rarity"),
    setName: g.name, imageUrl: p.imageUrl, cents, choices: hits.length,
    nameDiffers: base(p.name) !== base(nameBase),
  };
}
