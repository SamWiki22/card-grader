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

export function money(n) {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
