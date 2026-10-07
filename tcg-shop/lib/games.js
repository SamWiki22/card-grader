// Games the shop carries.
//   status "live": shown on the storefront and in admin
//   status "soon": admin only, so you can stock singles and prep decks before launch
//   status "off":  hidden everywhere (kept so older data still has a label)
// To go live with a "soon" game without a code change, list the live games in
// NEXT_PUBLIC_LIVE_GAMES, e.g. NEXT_PUBLIC_LIVE_GAMES=onepiece,gundam,dragonball,unionarena,riftbound,mtg
//
// `idDecklists`: the game's decklists are usually card IDs ("4xOP01-016") instead of names, and
// singles should be stocked with that ID in the "number" field so decks link to them.
export const GAMES = [
  { id: "onepiece", label: "One Piece", icon: "☠️", status: "live", idDecklists: true },
  { id: "gundam", label: "Gundam Card Game", icon: "🤖", status: "live", idDecklists: true },
  { id: "dragonball", label: "Dragon Ball Super Fusion World", icon: "🐉", status: "live", idDecklists: true },
  { id: "unionarena", label: "Union Arena", icon: "🎴", status: "live", idDecklists: true },
  { id: "riftbound", label: "Riftbound", icon: "⚔️", status: "live" },
  { id: "mtg", label: "Magic: The Gathering", icon: "🧙", status: "soon" },
  { id: "pokemon", label: "Pokémon", icon: "⚡", status: "off" },
  { id: "yugioh", label: "Yu-Gi-Oh!", icon: "👁️", status: "off" },
  { id: "lorcana", label: "Disney Lorcana", icon: "✨", status: "off" },
];

const liveOverride = (process.env.NEXT_PUBLIC_LIVE_GAMES || "").split(",").map(s => s.trim()).filter(Boolean);
const isLive = g => (liveOverride.length ? liveOverride.includes(g.id) : g.status === "live");

export const GAME_MAP = Object.fromEntries(GAMES.map(g => [g.id, g]));
export const LIVE_GAMES = GAMES.filter(isLive);
export const LIVE_GAME_IDS = LIVE_GAMES.map(g => g.id);
// Admin pickers: live games first, then ones being prepped.
export const ADMIN_GAMES = [
  ...LIVE_GAMES,
  ...GAMES.filter(g => !isLive(g) && g.status === "soon").map(g => ({ ...g, label: `${g.label} (not live yet)` })),
];
export const DEFAULT_GAME = LIVE_GAMES[0]?.id || GAMES[0].id;

export const gameLabel = id => GAME_MAP[id]?.label || id;
export const isLiveGame = id => LIVE_GAME_IDS.includes(id);

// Where to find current tournament lists for each game, shown in the admin importer.
// Lists are copied in with "Paste a decklist" (use each site's Export / Copy button).
const LIMITLESS_PLAY = { name: "Limitless (tournament results)", url: "https://play.limitlesstcg.com/tournaments/completed" };
export const NETDECK_SOURCES = {
  onepiece: [{ name: "Limitless One Piece", url: "https://onepiece.limitlesstcg.com/decks" }, { name: "One Piece Top Decks", url: "https://onepiecetopdecks.com/" }, LIMITLESS_PLAY],
  gundam: [LIMITLESS_PLAY],
  dragonball: [LIMITLESS_PLAY],
  unionarena: [LIMITLESS_PLAY],
  riftbound: [{ name: "Piltover Archive", url: "https://piltoverarchive.com/" }, LIMITLESS_PLAY],
  mtg: [
    { name: "MTGTop8", url: "https://www.mtgtop8.com/" },
    { name: "MTGGoldfish Metagame", url: "https://www.mtggoldfish.com/metagame" },
    { name: "Official MTGO decklists", url: "https://www.mtgo.com/decklists" },
  ],
};
