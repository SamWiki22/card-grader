import { normName } from "./match.js";
import { GAME_MAP } from "./games.js";

// Turns "copies owed to pre-order customers + copies I want on the shelf" into one combined list
// of singles to buy, across every deck. Cards are pooled by game + name (any printing plays the same),
// so a staple used in five decks shows up once with the total you need.
//
// decks: [{ id, name, game, quantity, target_stock, deck_cards: [{ count, name, set_code, number, card }] }]
// owed:  { [deckId]: paid pre-order copies not yet filled }
export function sourcingPlan(decks, owed = {}, { bulkUnder = 1 } = {}) {
  const plan = decks
    .map(d => {
      const want = (owed[d.id] || 0) + (d.target_stock || 0);
      return { deck: d, owed: owed[d.id] || 0, want, copies: Math.max(0, want - d.quantity) };
    })
    .filter(p => p.want > 0);

  const pooled = new Map();
  for (const { deck, copies } of plan) {
    if (!copies) continue;
    for (const dc of deck.deck_cards) {
      const id = GAME_MAP[deck.game]?.idDecklists && (dc.number || "").trim().toUpperCase();
      const key = id ? `${deck.game}|id|${id}` : `${deck.game}|${normName(dc.name)}`;
      let row = pooled.get(key);
      if (!row) {
        row = { game: deck.game, name: dc.name, set_code: dc.set_code, number: dc.number, need: 0, linked: new Map(), decks: new Set() };
        pooled.set(key, row);
      }
      row.need += dc.count * copies;
      row.decks.add(deck.name);
      if (dc.card) row.linked.set(dc.card.id, dc.card);
    }
  }

  const rows = [...pooled.values()]
    .map(r => {
      const cards = [...r.linked.values()];
      const have = cards.reduce((s, c) => s + (c.quantity || 0), 0);
      const prices = cards.map(c => Number(c.price)).filter(p => p > 0);
      const price = prices.length ? Math.min(...prices) : null;
      const tier = price == null ? "unknown" : price < bulkUnder ? "bulk" : "staple";
      return { game: r.game, name: r.name, set_code: r.set_code, number: r.number, need: r.need, have, short: Math.max(0, r.need - have), price, tier, decks: [...r.decks] };
    })
    .filter(r => r.short > 0)
    .sort((a, b) => a.game.localeCompare(b.game) || b.short - a.short || a.name.localeCompare(b.name));

  return { plan, rows };
}

// TCGplayer Mass Entry / Card Kingdom / most "paste a list" carts accept "<qty> <name>" per line.
// Names only, so the site's optimizer is free to pick the cheapest printing.
export const massEntryList = rows => rows.map(r => `${r.short} ${r.name}`).join("\n");

// For card-id games: "<qty> <name> <id>" so you (or a seller) can pick the exact card.
export const idList = rows => rows.map(r => `${r.short} ${r.name}${r.number && r.number !== r.name ? ` ${r.number}` : ""}`).join("\n");
