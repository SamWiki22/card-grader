// Limitless TCG API (https://docs.limitlesstcg.com/developer.html) — tournament results with
// decklists for Pokémon and other games hosted on play.limitlesstcg.com.
const BASE = "https://play.limitlesstcg.com/api";

export async function limitlessFetch(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  const headers = { Accept: "application/json" };
  if (process.env.LIMITLESS_API_KEY) headers["X-Access-Key"] = process.env.LIMITLESS_API_KEY;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Limitless ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Standings decklists come as { pokemon: [...], trainer: [...], energy: [...] } for PTCG and as
// other section maps (or a flat array) for other games. Each entry has count + name and/or id/set/number.
export function normalizeLimitlessDecklist(decklist) {
  const out = [];
  const walk = (section, list) => {
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const count = Number(c.count ?? c.qty ?? c.quantity ?? 1);
      const name = c.name ?? c.card ?? c.id;
      if (!name || !(count > 0)) continue;
      out.push({
        section: String(section).toLowerCase(),
        count,
        name: String(name),
        set_code: String(c.set ?? ""),
        number: String(c.number ?? c.id ?? ""),
      });
    }
  };
  if (Array.isArray(decklist)) walk("main", decklist);
  else if (decklist && typeof decklist === "object") {
    for (const [section, list] of Object.entries(decklist)) if (Array.isArray(list)) walk(section, list);
  }
  return out;
}

export function normalizeStanding(s) {
  return {
    player: s.name || s.player || "",
    placing: s.placing ?? null,
    record: s.record ? `${s.record.wins ?? 0}-${s.record.losses ?? 0}-${s.record.ties ?? 0}` : "",
    deckName: s.deck?.name || "",
    deckId: s.deck?.id || "",
    cards: normalizeLimitlessDecklist(s.decklist),
  };
}
