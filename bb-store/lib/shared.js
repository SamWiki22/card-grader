// Constants and helpers safe to use in the browser.
export const GAMES = [
  { id: "pokemon", label: "Pokémon", short: "Pokémon" },
  { id: "mtg", label: "Magic: The Gathering", short: "Magic" },
  { id: "dbs", label: "Dragon Ball", short: "Dragon Ball" },
  { id: "onepiece", label: "One Piece", short: "One Piece" },
  { id: "gundam", label: "Gundam", short: "Gundam" },
  { id: "unionarena", label: "Union Arena", short: "Union Arena" },
  { id: "other", label: "Other", short: "Other" },
];
export const GAME_SHORT = Object.fromEntries(GAMES.map(g => [g.id, g.short]));
// Accent color per game in the Packs app.
export const GAME_COLOR = { pokemon: "#e0b04a", mtg: "#b5773f", dbs: "#e8743a", onepiece: "#e0605a", gundam: "#5aa0e0", unionarena: "#4fc3b6", other: "#9aa3b8" };
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
