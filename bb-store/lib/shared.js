// Constants and helpers safe to use in the browser.
export const GAMES = [
  { id: "pokemon", label: "Pokémon" },
  { id: "mtg", label: "Magic: The Gathering" },
  { id: "onepiece", label: "One Piece" },
  { id: "dbs", label: "Dragon Ball" },
  { id: "gundam", label: "Gundam" },
  { id: "unionarena", label: "Union Arena" },
  { id: "other", label: "Other" },
];
// Accent color per game in the Packs app.
export const GAME_COLOR = { pokemon: "#8b6cff", onepiece: "#e0605a", mtg: "#e8933a", dbs: "#f2b632", gundam: "#5aa0e0", unionarena: "#4fc3b6", other: "#9aa3b8" };
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
