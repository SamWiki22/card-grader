import { test } from "node:test";
import assert from "node:assert/strict";
import { deckAvailability, isNewSet, isUpcoming, byNewestSet } from "../lib/preorder.js";
import { sourcingPlan, massEntryList } from "../lib/sourcing.js";

test("availability: stock, pre-order caps, sold out", () => {
  assert.deepEqual(deckAvailability({ quantity: 3 }), { mode: "stock", max: 3 });
  assert.deepEqual(deckAvailability({ quantity: 0, preorder_enabled: true, preorder_limit: null }), { mode: "preorder", max: 10 });
  assert.deepEqual(deckAvailability({ quantity: 0, preorder_enabled: true, preorder_limit: 5 }, 3), { mode: "preorder", max: 2 });
  assert.deepEqual(deckAvailability({ quantity: 0, preorder_enabled: true, preorder_limit: 5 }, 5), { mode: "soldout", max: 0 });
  assert.deepEqual(deckAvailability({ quantity: 0, preorder_enabled: false }), { mode: "soldout", max: 0 });
});

test("new / upcoming set flags and ordering", () => {
  const now = new Date("2026-10-07T12:00:00");
  assert.equal(isNewSet({ set_release_date: "2026-09-20" }, 60, now), true);
  assert.equal(isNewSet({ set_release_date: "2026-01-01" }, 60, now), false);
  assert.equal(isUpcoming({ set_release_date: "2026-11-07" }, now), true);
  const sorted = [{ set_release_date: "2026-01-01" }, {}, { set_release_date: "2026-09-20" }].sort(byNewestSet);
  assert.equal(sorted[0].set_release_date, "2026-09-20");
});

test("sourcing pools cards across decks and splits bulk vs staples", () => {
  const ultra = { id: "u", price: 0.1, quantity: 5 };
  const boss = { id: "b", price: 3, quantity: 0 };
  const decks = [
    { id: "d1", name: "Deck A", game: "pokemon", quantity: 1, target_stock: 2,
      deck_cards: [{ count: 4, name: "Ultra Ball", card: ultra }, { count: 2, name: "Boss's Orders", card: boss }] },
    { id: "d2", name: "Deck B", game: "pokemon", quantity: 0, target_stock: 0,
      deck_cards: [{ count: 3, name: "ultra ball", card: null }, { count: 1, name: "New Card", card: null }] },
    { id: "d3", name: "Idle", game: "pokemon", quantity: 0, target_stock: 0, deck_cards: [{ count: 4, name: "X", card: null }] },
  ];
  // Deck A: 2 owed + 2 target - 1 on shelf = 3 copies. Deck B: 1 owed.
  const { plan, rows } = sourcingPlan(decks, { d1: 2, d2: 1 }, { bulkUnder: 1 });
  assert.deepEqual(plan.map(p => [p.deck.id, p.copies]), [["d1", 3], ["d2", 1]]);
  const ub = rows.find(r => r.name === "Ultra Ball");
  assert.deepEqual([ub.need, ub.have, ub.short, ub.tier], [15, 5, 10, "bulk"]);
  assert.deepEqual(ub.decks, ["Deck A", "Deck B"]);
  assert.equal(rows.find(r => r.name === "Boss's Orders").tier, "staple");
  assert.equal(rows.find(r => r.name === "New Card").tier, "unknown");
  assert.match(massEntryList(rows), /^10 Ultra Ball$/m);
});
