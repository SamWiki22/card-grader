import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { centsToMoney, TCG_SOURCES } from "../lib/shared";

const LAST = "bb-tcg-last"; // remembers game + set between searches (per browser)
const readLast = () => { try { return JSON.parse(localStorage.getItem(LAST)) || {}; } catch { return {}; } };

// Find a card on TCGplayer: pick catalog (game) → set → search → printing.
// Calls onPick({ categoryId, groupId, productId, subType, name, setName, number, imageUrl, cents, autoPrice, sealed }).
// With `remember`, it reopens on the last game/set used, so entering a stack from one set is just search → tap.
export default function TcgPicker({ sources = TCG_SOURCES, initialGame, onPick, onClose, title = "Find on TCGplayer", showSync = true, allowSealed = false, remember = false, initialQuery = "", initialSetFilter = "" }) {
  const last = remember ? readLast() : {};
  const [game, setGame] = useState((sources.find(s => s.id === last.source) || sources.find(s => s.game === initialGame) || sources[0]).id);
  const [sealed, setSealed] = useState(allowSealed && !!last.sealed);
  const [sets, setSets] = useState([]);
  const [setFilter, setSetFilter] = useState(initialSetFilter);
  const [group, setGroup] = useState("");
  const [q, setQ] = useState(initialQuery);
  const [cards, setCards] = useState(null);
  const [autoPrice, setAutoPrice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSets([]); setCards(null); setError("");
    setGroup(remember && readLast().source === game ? String(readLast().group || "") : "");
    fetch(`/api/tcg?source=${game}`).then(r => r.json()).then(d => d.error ? setError(d.error) : setSets(d.sets)).catch(() => setError("Couldn’t load sets."));
  }, [game]);

  const shownSets = useMemo(() => {
    const t = setFilter.toLowerCase();
    return sets.filter(s => !t || `${s.name} ${s.abbreviation}`.toLowerCase().includes(t));
  }, [sets, setFilter]);

  async function search(e) {
    e?.preventDefault();
    e?.stopPropagation(); // the picker can sit inside another form — don't submit that one too
    if (!group) return setError("Pick a set first.");
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/tcg?source=${game}&group=${group}&q=${encodeURIComponent(q)}${sealed ? "&kind=sealed" : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setCards(d.cards);
    } catch (err) { setError(err.message || "Search failed."); }
    setBusy(false);
  }
  useEffect(() => { if (group) search(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [group, sealed]);
  useEffect(() => {
    if (!remember) return;
    try { localStorage.setItem(LAST, JSON.stringify({ source: game, group, sealed })); } catch {}
  }, [remember, game, group, sealed]);

  const setName = sets.find(s => String(s.groupId) === String(group))?.name || "";

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="tcg-controls">
        <select className="input" value={game} onChange={e => setGame(e.target.value)} aria-label="Game">
          {sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input className="input" placeholder="Filter sets (e.g. Evolving, OP-05)" value={setFilter} onChange={e => setSetFilter(e.target.value)} />
        <select className="input" value={group} onChange={e => setGroup(e.target.value)} aria-label="Set">
          <option value="">{sets.length ? `Pick a set (${shownSets.length})` : "Loading sets…"}</option>
          {shownSets.map(s => <option key={s.groupId} value={s.groupId}>{s.name}</option>)}
        </select>
        <form onSubmit={search} className="tcg-search">
          {allowSealed && (
            <select className="input" value={sealed ? "sealed" : "singles"} onChange={e => setSealed(e.target.value === "sealed")} aria-label="Singles or sealed">
              <option value="singles">Singles</option><option value="sealed">Sealed</option>
            </select>
          )}
          <input className="input" placeholder={sealed ? "Product name" : "Card name or number"} value={q} onChange={e => setQ(e.target.value)} autoFocus={remember && !!group} />
          <button className="btn btn-small" disabled={busy || !group}>{busy ? "…" : "Search"}</button>
        </form>
      </div>
      {showSync && <label className="check"><input type="checkbox" checked={autoPrice} onChange={e => setAutoPrice(e.target.checked)} /><span>Keep this card’s price synced to TCGplayer market (updates daily)</span></label>}
      {error && <p className="error">{error}</p>}
      {cards && !cards.length && <p className="muted">{sealed ? "No sealed products found in this set." : "No cards found in this set."}</p>}
      {cards?.length > 0 && (
        <ul className="tcg-results">
          {cards.map(c => (
            <li key={c.productId}>
              <img src={c.imageUrl} alt="" loading="lazy" />
              <div className="tcg-info">
                <b>{c.name}</b>
                <span className="muted small">{c.number}{c.rarity ? ` · ${c.rarity}` : ""}</span>
                <div className="tcg-prices">
                  {c.prices.length ? c.prices.map(p => (
                    <button key={p.subType} className="btn btn-small btn-ghost-dark" onClick={() => onPick({
                      categoryId: c.categoryId, groupId: c.groupId, productId: c.productId, subType: p.subType,
                      name: c.name, setName, number: c.number, imageUrl: c.imageUrl, cents: p.cents, autoPrice, sealed,
                    })}>{p.subType} · {centsToMoney(p.cents)}</button>
                  )) : <span className="muted small">No market price yet</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
