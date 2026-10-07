import { useState } from "react";
import { ADMIN_GAMES as GAMES, DEFAULT_GAME, NETDECK_SOURCES } from "../../lib/games";
import { parseDecklist, deckSize, decklistMeta, deckWarnings } from "../../lib/decklist";
import { importDeck } from "../../lib/deckImport";
import { apiUrl } from "../../lib/api";

// "Net-decking": pull top-finishing lists from tournament results (Limitless API) or paste a list
// exported from any deck site, and turn it into a draft deck linked to singles inventory.
export default function MetaTab({ onImported }) {
  return (
    <div className="stack">
      <LimitlessBrowser onImported={onImported} />
      <PasteImport onImported={onImported} />
    </div>
  );
}

function LimitlessBrowser({ onImported }) {
  const [game, setGame] = useState(DEFAULT_GAME);
  const [code, setCode] = useState(() => savedCode(DEFAULT_GAME));
  const [format, setFormat] = useState("");
  const [tournaments, setTournaments] = useState(null);
  const [event, setEvent] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const pickGame = id => {
    setGame(id);
    setCode(savedCode(id));
    setTournaments(null);
    setEvent(null);
  };

  const loadTournaments = async () => {
    setBusy("tournaments"); setError(""); setEvent(null);
    try {
      try { localStorage.setItem(`limitless-code-${game}`, code); } catch (_) {}
      const r = await fetch(apiUrl(`/api/meta/tournaments?game=${encodeURIComponent(code)}&format=${encodeURIComponent(format)}&limit=30`));
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setTournaments(body.tournaments);
    } catch (e) { setError(e.message); }
    setBusy("");
  };

  const loadEvent = async id => {
    setBusy(id); setError("");
    try {
      const r = await fetch(apiUrl(`/api/meta/standings?id=${encodeURIComponent(id)}&top=32`));
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setEvent(body);
      if (!body.players.length) setError("This event has no public decklists.");
    } catch (e) { setError(e.message); }
    setBusy("");
  };

  const doImport = async p => {
    setBusy(`imp-${p.player}`); setError("");
    try {
      const t = event.tournament;
      const id = await importDeck({
        game,
        name: p.deckName || `${p.player}'s deck`,
        archetype: p.deckName || "",
        format: t.format || format || "",
        cards: p.cards,
        source_name: "Limitless TCG",
        source_url: event.url,
        source_event: [t.name, t.date ? new Date(t.date).toLocaleDateString() : ""].filter(Boolean).join(" — "),
        source_player: p.player,
        source_placing: p.placing ? placingLabel(p.placing) : "",
      });
      onImported(id);
    } catch (e) { setError(e.message); setBusy(""); }
  };

  return (
    <div className="card stack">
      <h2>Tournament results (Limitless TCG)</h2>
      <p className="muted small">Pick a recent event, browse top finishers, and import any list as a draft deck. Lists are credited to the player and event.</p>
      <p className="muted small">
        Tip: to get a game&apos;s code, open <a href="https://play.limitlesstcg.com/tournaments/completed" target="_blank" rel="noreferrer">Limitless completed tournaments</a>,
        filter by the game, and copy the <code>game=</code> value from the address bar. It&apos;s remembered per game. If a game has no
        events with public decklists there, use <em>Paste a decklist</em> below.
      </p>
      <div className="form-grid">
        <div><label>Game</label>
          <select value={game} onChange={e => pickGame(e.target.value)}>{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
        <div><label>Limitless game code</label><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="see tip below" /></div>
        <div><label>Format (optional)</label><input value={format} onChange={e => setFormat(e.target.value.toUpperCase())} placeholder="e.g. STANDARD" /></div>
        <div style={{ alignSelf: "end" }}><button className="btn primary" onClick={loadTournaments} disabled={!code || !!busy}>{busy === "tournaments" ? "Loading…" : "Load recent events"}</button></div>
      </div>
      {error && <div className="error">{error}</div>}

      {tournaments && !event && (
        <div className="scroll-x">
          {tournaments.length === 0 && <p className="muted">No events found for that game code/format.</p>}
          <table><tbody>
            {tournaments.map(t => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong><div className="small muted">{t.date ? new Date(t.date).toLocaleDateString() : ""} {t.format}</div></td>
                <td className="small">{t.players ? `${t.players} players` : ""}</td>
                <td style={{ textAlign: "right" }}><button className="btn small" onClick={() => loadEvent(t.id)} disabled={!!busy}>{busy === t.id ? "Loading…" : "Top decks"}</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {event && (
        <div className="stack">
          <div className="spread">
            <h3 style={{ margin: 0 }}>{event.tournament.name || event.tournament.id}</h3>
            <button className="btn small" onClick={() => setEvent(null)}>← Events</button>
          </div>
          <table><tbody>
            {event.players.map(p => (
              <FragmentRow key={`${p.player}-${p.placing}`} p={p} open={expanded === p.player}
                onToggle={() => setExpanded(expanded === p.player ? null : p.player)}
                onImport={() => doImport(p)} busy={busy === `imp-${p.player}`} disabled={!!busy} />
            ))}
          </tbody></table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ p, open, onToggle, onImport, busy, disabled }) {
  return (
    <>
      <tr>
        <td style={{ width: 50 }}>{p.placing ? placingLabel(p.placing) : "—"}</td>
        <td><strong>{p.deckName || "Unnamed deck"}</strong><div className="small muted">{p.player} {p.record && `· ${p.record}`}</div></td>
        <td className="small">{deckSize(p.cards)} cards</td>
        <td style={{ textAlign: "right" }} className="row">
          <button className="btn small" onClick={onToggle}>{open ? "Hide" : "View"}</button>
          <button className="btn small primary" onClick={onImport} disabled={disabled}>{busy ? "Importing…" : "Import"}</button>
        </td>
      </tr>
      {open && (
        <tr><td colSpan={4}>
          <div className="small" style={{ columns: "220px", columnGap: 24 }}>
            {p.cards.map((c, i) => <div key={i}>{c.count} {c.name} <span className="muted">{c.set_code} {c.number !== c.name ? c.number : ""} · {c.section}</span></div>)}
          </div>
        </td></tr>
      )}
    </>
  );
}

function PasteImport({ onImported }) {
  const [f, setF] = useState({ game: DEFAULT_GAME, name: "", format: "", source_name: "", source_url: "", source_event: "", source_player: "", source_placing: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsed = parseDecklist(f.text, { game: f.game });
  const meta = decklistMeta(f.text);
  const warnings = parsed.length ? deckWarnings(parsed, f.game, meta.declared) : [];
  const set = k => e => setF({ ...f, [k]: e.target.value });
  // A pasted list's title line ("Blue Rocks Deck") fills in the deck name unless you've typed one.
  const setText = e => {
    const text = e.target.value;
    const title = decklistMeta(text).title;
    setF({ ...f, text, name: f.name && f.name !== decklistMeta(f.text).title ? f.name : title || f.name });
  };

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const { text, ...meta } = f;
      const id = await importDeck({ ...meta, archetype: f.name, cards: parsed });
      onImported(id);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const sources = NETDECK_SOURCES[f.game] || [];
  return (
    <div className="card stack">
      <h2>Paste a decklist (any game)</h2>
      <p className="muted small">
        Use the site&apos;s <em>Export</em> / <em>Copy to clipboard</em> button (Bandai card-ID lists like <code>4xOP01-016</code>, Riftbound section lists, MTG Arena/MTGO and plain &ldquo;4 Card Name&rdquo; all work).
        {sources.length > 0 && <> Current results: {sources.map((s, i) => <span key={s.url}>{i ? ", " : ""}<a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>)}.</>}
      </p>
      <div className="form-grid">
        <div><label>Game</label><select value={f.game} onChange={set("game")}>{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
        <div><label>Deck name *</label><input value={f.name} onChange={set("name")} placeholder="e.g. Red/Purple Luffy" /></div>
        <div><label>Format</label><input value={f.format} onChange={set("format")} placeholder="e.g. OP-12 / Standard" /></div>
        <div><label>Event</label><input value={f.source_event} onChange={set("source_event")} placeholder="e.g. Regionals, Store Championship" /></div>
        <div><label>Player</label><input value={f.source_player} onChange={set("source_player")} /></div>
        <div><label>Placing</label><input value={f.source_placing} onChange={set("source_placing")} placeholder="e.g. 1st, Top 8" /></div>
        <div><label>Source site</label><input value={f.source_name} onChange={set("source_name")} placeholder="e.g. Limitless" /></div>
        <div><label>Source URL</label><input value={f.source_url} onChange={set("source_url")} placeholder="https://…" /></div>
      </div>
      <textarea value={f.text} onChange={setText} placeholder={"Leader\n1xOP09-001\nMain Deck\n4xOP01-016\n4 Nami (OP01-016)\n…or Riftbound: Legend: / Champion: / MainDeck: / Battlefields: / Runes:"} />
      <div className="spread">
        <span className="small muted">
          Parsed {parsed.length} unique cards · {[...new Set(parsed.map(c => c.section))].map(s => `${s}: ${deckSize(parsed, s)}`).join(" · ") || "nothing yet"}
        </span>
        <button className="btn primary" onClick={submit} disabled={busy || !parsed.length || !f.name.trim()}>{busy ? "Importing…" : "Import as draft deck"}</button>
      </div>
      {warnings.length > 0 && (
        <ul className="small" style={{ color: "var(--warn)", margin: 0 }}>{warnings.map(w => <li key={w}>{w}</li>)}</ul>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function savedCode(game) {
  try { return localStorage.getItem(`limitless-code-${game}`) || ""; } catch (_) { return ""; }
}

function placingLabel(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
