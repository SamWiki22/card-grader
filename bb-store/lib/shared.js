// Constants and helpers safe to use in the browser.
export const GAMES = [
  { id: "pokemon", label: "Pokémon", short: "Pokémon" },
  { id: "mtg", label: "Magic: The Gathering", short: "Magic" },
  { id: "dbs", label: "Dragon Ball", short: "Dragon Ball" },
  { id: "onepiece", label: "One Piece", short: "One Piece" },
  { id: "gundam", label: "Gundam", short: "Gundam" },
  { id: "unionarena", label: "Union Arena", short: "Union Arena" },
  { id: "riftbound", label: "Riftbound", short: "Riftbound" },
  { id: "other", label: "Other", short: "Other" },
];
export const GAME_SHORT = Object.fromEntries(GAMES.map(g => [g.id, g.short]));
// Accent color per game in the Packs app.
export const GAME_COLOR = { pokemon: "#e0b04a", mtg: "#b5773f", dbs: "#e8743a", onepiece: "#e0605a", gundam: "#5aa0e0", unionarena: "#4fc3b6", riftbound: "#b07ae0", other: "#9aa3b8" };
export const GAME_LABEL = Object.fromEntries(GAMES.map(g => [g.id, g.label]));

// Shop categories → inventory "type" values.
export const CATEGORIES = {
  singles: { label: "Singles", types: ["single"] },
  sealed: { label: "Sealed", types: ["box", "pack"] },
};

export const TYPE_LABEL = { single: "Single", box: "Booster Box", pack: "Pack" };

export const CONDITION_LABEL = {
  NM: "Near Mint", LP: "Lightly Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Damaged",
};

// Pack credit top-up amounts, in dollars.
export const TOPUP_AMOUNTS = [10, 25, 50, 100];

export const centsToMoney = c => money((Number(c) || 0) / 100);

export function money(n) {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Where a card's value comes from (pack cards and store singles).
export const COMP_SOURCES = ["eBay", "Goldin", "Card Ladder", "Fanatics Collect", "Heritage", "Other"];
export function valueBasis(row) {
  if (row.price_source === "tcgplayer") return "TCGplayer market price";
  if (row.price_source === "comp" && row.comp_cents != null) {
    const when = row.comp_date ? ` on ${new Date(String(row.comp_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";
    return `Last sold${row.comp_source ? ` on ${row.comp_source}` : ""}${when}`;
  }
  return "Bearded Bear valuation";
}

// TCGplayer catalogs you can search, mapped to the store's games.
// Dragon Ball has two: the current Fusion World game and the older Masters game.
export const TCG_SOURCES = [
  { id: "pokemon", game: "pokemon", categoryId: 3, label: "Pokémon" },
  { id: "mtg", game: "mtg", categoryId: 1, label: "Magic: The Gathering" },
  { id: "dbs-fw", game: "dbs", categoryId: 80, label: "Dragon Ball Fusion World" },
  { id: "dbs-masters", game: "dbs", categoryId: 27, label: "Dragon Ball Super Masters" },
  { id: "onepiece", game: "onepiece", categoryId: 68, label: "One Piece" },
  { id: "gundam", game: "gundam", categoryId: 86, label: "Gundam" },
  { id: "unionarena", game: "unionarena", categoryId: 81, label: "Union Arena" },
  { id: "riftbound", game: "riftbound", categoryId: 89, label: "Riftbound" },
];

// Condition / grade suggestions for card submissions.
export const GRADE_OPTIONS = ["Raw NM", "Raw LP", "Raw MP", "Raw HP", "PSA 10", "PSA 9", "PSA 8", "BGS 10", "BGS 9.5", "CGC 10", "CGC 9.5", "TAG 10"];

// ── Rarity + standard bulk prices ────────────────────────────────────────────
// Rarity is stored the way TCGplayer writes it for that game ("C", "UC", "SR", "Common", "M"…).
// Bulk cards never sell below these standard rates (cents). Higher rarities have no floor.
export const BULK_RATES = { common: 29, uncommon: 59, rare: 100, foilRare: 200 };
export const RARITY_SUGGESTIONS = ["C", "UC", "R", "SR", "SEC", "L", "SP", "U", "M", "Common", "Uncommon", "Rare", "Super Rare", "Promo"];
// "C", "Common", "C+", "C*" → common; "UC", "U", "Uncommon" → uncommon; "R", "Rare", "R+" → rare.
export function bulkClass(rarity) {
  const r = String(rarity || "").trim().toLowerCase().replace(/[+*]+$/, "");
  if (r === "c" || r === "common") return "common";
  if (r === "uc" || r === "u" || r === "uncommon") return "uncommon";
  if (r === "r" || r === "rare") return "rare";
  return "";
}
// Lowest price (cents) a single may sell for, or 0 if its rarity has no standard rate.
export function bulkFloorCents(rarity, foil, rates = BULK_RATES) {
  const c = bulkClass(rarity);
  if (c === "rare") return foil ? rates.foilRare : rates.rare;
  return c ? rates[c] : 0;
}
