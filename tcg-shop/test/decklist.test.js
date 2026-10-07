import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDecklist, formatDecklist, deckSize } from "../lib/decklist.js";
import { matchDeck } from "../lib/match.js";
import { deckPricing, buildableCopies, shortfall } from "../lib/pricing.js";
import { normalizeLimitlessDecklist } from "../lib/limitless.js";

test("PTCG Live export", () => {
  const cards = parseDecklist(`Pokémon: 3
2 Charizard ex OBF 125
1 Pidgey MEW 16

Trainer: 2
4 Arven SVI 166
* 4 Rare Candy SVI 191

Energy: 1
6 Basic Fire Energy SVE 2

Total Cards: 17`);
  assert.deepEqual(cards[0], { section: "pokemon", count: 2, name: "Charizard ex", set_code: "OBF", number: "125" });
  assert.equal(cards.find(c => c.name === "Rare Candy").count, 4);
  assert.equal(cards.find(c => c.name === "Basic Fire Energy").section, "energy");
  assert.equal(deckSize(cards), 17);
});

test("MTG Arena export with sideboard header", () => {
  const cards = parseDecklist(`Deck
4 Lightning Bolt (M11) 146
20 Mountain (ZNR) 381

Sideboard
2 Smash to Smithereens (ORI) 163`, { game: "mtg" });
  assert.deepEqual(cards[0], { section: "main", count: 4, name: "Lightning Bolt", set_code: "M11", number: "146" });
  assert.equal(cards[2].section, "sideboard");
});

test("MTGO txt: blank line separates sideboard", () => {
  const cards = parseDecklist(`4 Ragavan, Nimble Pilferer
4 Lightning Bolt

3 Blood Moon`, { game: "mtg" });
  assert.equal(cards[0].name, "Ragavan, Nimble Pilferer");
  assert.equal(cards[2].section, "sideboard");
});

test("blank lines do not create a sideboard outside MTG", () => {
  const cards = parseDecklist("4 Arven\n\n4 Iono", { game: "pokemon" });
  assert.ok(cards.every(c => c.section === "main"));
});

test("One Piece card ids and x-suffix formats", () => {
  const cards = parseDecklist(`1xOP05-119
4xOP01-016
Nami x3`);
  assert.deepEqual(cards[0], { section: "main", count: 1, name: "OP05-119", set_code: "OP05", number: "OP05-119" });
  assert.equal(cards[2].count, 3);
  assert.equal(cards[2].name, "Nami");
});

test("duplicate lines merge", () => {
  const cards = parseDecklist("2 Iono\n2x Iono");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].count, 4);
});

test("format round-trips", () => {
  const cards = parseDecklist("Pokémon: 1\n2 Pidgey MEW 16");
  assert.deepEqual(parseDecklist(formatDecklist(cards)), cards);
});

const inventory = [
  { id: "a", name: "Arven", set_code: "SVI", number: "166", quantity: 3, price: 0.5 },
  { id: "a2", name: "Arven", set_code: "OBF", number: "186", quantity: 10, price: 2 },
  { id: "p", name: "Pokémon Catcher", set_code: "SVI", number: "187", quantity: 8, price: 0.25 },
  { id: "o", name: "Monkey.D.Luffy", set_code: "OP05", number: "OP05-119", quantity: 2, price: 30 },
];

test("matching prefers exact printing, then name, then card id", () => {
  const m = matchDeck(
    [
      { count: 4, name: "Arven", set_code: "SVI", number: "166" },
      { count: 4, name: "Arven" },
      { count: 2, name: "Pokemon Catcher" },
      { count: 1, name: "OP05-119", number: "OP05-119" },
      { count: 1, name: "Missing Card" },
    ],
    inventory,
  );
  assert.deepEqual(m.map(c => c.card_id), ["a", "a2", "p", "o", null]);
});

test("pricing, buildable copies and shortfall", () => {
  const byId = Object.fromEntries(inventory.map(c => [c.id, c]));
  const dcs = [
    { count: 2, card: byId.a },
    { count: 4, card: byId.p },
  ];
  assert.deepEqual(deckPricing({ price: null, discount_pct: 10 }, dcs), { price: 1.8, singlesTotal: 2, complete: true, savings: 0.2 });
  assert.equal(deckPricing({ price: 25, discount_pct: 10 }, dcs).price, 25);
  assert.equal(buildableCopies(dcs), 1);
  assert.deepEqual(shortfall(dcs, 2).map(r => r.short), [1, 0]);
  assert.equal(deckPricing({ price: null }, [...dcs, { count: 1, card: null }]).price, null);
  assert.equal(buildableCopies([...dcs, { count: 1, card: null }]), 0);
});

test("Limitless decklist normalization", () => {
  const cards = normalizeLimitlessDecklist({
    pokemon: [{ count: 3, name: "Charmander", set: "MEW", number: "4" }],
    trainer: [{ count: 4, name: "Arven" }],
  });
  assert.deepEqual(cards[0], { section: "pokemon", count: 3, name: "Charmander", set_code: "MEW", number: "4" });
  assert.equal(cards[1].section, "trainer");
  assert.deepEqual(normalizeLimitlessDecklist([{ count: 4, id: "OP01-016" }])[0].number, "OP01-016");
});

test("Bandai card-id formats for One Piece, Gundam, Fusion World, Union Arena", () => {
  const cards = parseDecklist(`Leader
1xOP09-001
Main Deck
4xOP01-016
4 GD01-001
4x FB01-001 Son Goku
4 Nami (OP01-016_p1)
3 UE01BT/JJK-1-001
2xEB01-012`);
  assert.deepEqual(cards[0], { section: "leader", count: 1, name: "OP09-001", set_code: "OP09", number: "OP09-001" });
  assert.equal(cards[1].section, "main");
  assert.deepEqual(cards[2], { section: "main", count: 4, name: "GD01-001", set_code: "GD01", number: "GD01-001" });
  assert.deepEqual(cards[3], { section: "main", count: 4, name: "Son Goku", set_code: "FB01", number: "FB01-001" });
  assert.deepEqual(cards[4], { section: "main", count: 4, name: "Nami", set_code: "OP01", number: "OP01-016_p1" });
  assert.deepEqual(cards[5], { section: "main", count: 3, name: "UE01BT/JJK-1-001", set_code: "UE01BT", number: "UE01BT/JJK-1-001" });
  assert.equal(cards[6].number, "EB01-012");
});

test("Riftbound sections and ids", () => {
  const cards = parseDecklist(`Legend:
1 Jinx, Loose Cannon
Champion:
1 Jinx, Demolitionist
MainDeck:
3 Get Excited!
3 OGN-066/298
Battlefields:
1 Zaun Warrens
Runes:
6 Fury Rune
Sideboard:
2 Stacked Deck`);
  assert.deepEqual(cards.map(c => c.section), ["legend", "champion", "main", "main", "battlefields", "runes", "sideboard"]);
  assert.equal(cards[0].name, "Jinx, Loose Cannon");
  assert.deepEqual(cards[3], { section: "main", count: 3, name: "OGN-066/298", set_code: "OGN", number: "OGN-066/298" });
});

test("Gundam resource deck header", () => {
  const cards = parseDecklist("Deck\n4 GD01-001\nResource Deck\n10 R-001");
  assert.deepEqual(cards.map(c => c.section), ["main", "resources"]);
});

test("card-id matching beats name and shows the real name", () => {
  const inv = [
    { id: "luffyA", name: "Monkey.D.Luffy", set_code: "OP01", number: "OP01-003", quantity: 9, price: 1 },
    { id: "luffyB", name: "Monkey.D.Luffy", set_code: "OP05", number: "OP05-119", quantity: 1, price: 40 },
    { id: "ua", name: "Yuji Itadori", set_code: "UE01BT", number: "UE01BT/JJK-1-001", quantity: 4, price: 0.25 },
  ];
  const m = matchDeck(
    [
      { count: 4, name: "OP05-119", set_code: "OP05", number: "OP05-119" },
      { count: 4, name: "Monkey.D.Luffy", set_code: "", number: "OP05-119" },
      { count: 4, name: "ue01bt/jjk-1-001", set_code: "", number: "" },
    ],
    inv,
  );
  assert.deepEqual(m.map(c => c.card_id), ["luffyB", "luffyB", "ua"]);
  assert.equal(m[0].name, "Monkey.D.Luffy");
  assert.equal(m[2].name, "Yuji Itadori");
});

test("real One Piece export (Blue Rocks): title, sections, header counts, rules", async () => {
  const { readFileSync } = await import("node:fs");
  const { decklistMeta, deckWarnings } = await import("../lib/decklist.js");
  const text = readFileSync(new URL("./fixtures/onepiece-blue-rocks.txt", import.meta.url), "utf8");
  const cards = parseDecklist(text, { game: "onepiece" });
  const meta = decklistMeta(text);
  assert.equal(meta.title, "Blue Rocks Deck");
  assert.deepEqual(meta.declared, { leader: 1, character: 42, event: 8 });
  assert.deepEqual(cards[0], { section: "leader", count: 1, name: "Rocks.D.Xebec", set_code: "OP17", number: "OP17-039" });
  assert.equal(cards.find(c => c.number === "OP17-055").name, "There's No Authority in the World That Lasts Forever!!!");
  // Same name, different cards: leader and character Xebec stay separate.
  assert.equal(cards.filter(c => c.name === "Rocks.D.Xebec").length, 2);
  assert.deepEqual(deckWarnings(cards, "onepiece", meta.declared), []);

  const broken = deckWarnings(cards.filter(c => c.number !== "OP17-050"), "onepiece", meta.declared);
  assert.ok(broken.some(w => w.startsWith("character: header says 42, read 38")));
  assert.ok(broken.some(w => w.includes("should be 50")));
});
