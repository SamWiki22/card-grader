// Games the shop carries. `limitless` is the game code on play.limitlesstcg.com used by the
// Meta Decks importer; it's pre-filled in /admin but editable there, since Limitless adds
// games over time. `null` = no tournament API source; use "Paste a decklist" for that game.
export const GAMES = [
  { id: "pokemon", label: "Pokémon", icon: "⚡", limitless: "PTCG" },
  { id: "mtg", label: "Magic: The Gathering", icon: "🧙", limitless: null },
  { id: "onepiece", label: "One Piece", icon: "☠️", limitless: "OP" },
  { id: "yugioh", label: "Yu-Gi-Oh!", icon: "👁️", limitless: null },
  { id: "lorcana", label: "Disney Lorcana", icon: "✨", limitless: null },
  { id: "dragonball", label: "Dragon Ball Super", icon: "🐉", limitless: null },
  { id: "gundam", label: "Gundam", icon: "🤖", limitless: null },
  { id: "unionarena", label: "Union Arena", icon: "🎴", limitless: null },
];

export const GAME_MAP = Object.fromEntries(GAMES.map(g => [g.id, g]));

export const gameLabel = id => GAME_MAP[id]?.label || id;

// Where to find current tournament lists for each game, shown in the admin importer.
// Lists are copied in with "Paste a decklist" (each site has an Export / Copy decklist button).
export const NETDECK_SOURCES = {
  pokemon: [{ name: "Limitless TCG", url: "https://limitlesstcg.com/decks" }],
  mtg: [
    { name: "MTGTop8", url: "https://www.mtgtop8.com/" },
    { name: "MTGGoldfish Metagame", url: "https://www.mtggoldfish.com/metagame" },
    { name: "Official MTGO decklists", url: "https://www.mtgo.com/decklists" },
  ],
  onepiece: [{ name: "Limitless One Piece", url: "https://onepiece.limitlesstcg.com/decks" }],
  yugioh: [{ name: "YGOPRODeck Tournament Meta Decks", url: "https://ygoprodeck.com/category/format/tournament%20meta%20decks" }],
  lorcana: [{ name: "Inkdecks", url: "https://inkdecks.com/" }],
  dragonball: [{ name: "Limitless (Fusion World)", url: "https://play.limitlesstcg.com/tournaments/completed" }],
  gundam: [{ name: "Limitless", url: "https://play.limitlesstcg.com/tournaments/completed" }],
  unionarena: [{ name: "Limitless", url: "https://play.limitlesstcg.com/tournaments/completed" }],
};
