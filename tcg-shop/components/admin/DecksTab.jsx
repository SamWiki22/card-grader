import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { GAMES, gameLabel } from "../../lib/games";
import { deckPricing, buildableCopies, shortfall, money } from "../../lib/pricing";
import { deckSize, formatDecklist } from "../../lib/decklist";
import { rematchDeck } from "../../lib/deckImport";

const DECK_SELECT = "*, deck_cards(*, card:cards(id,name,set_code,number,price,quantity))";

export default function DecksTab({ openDeck, setOpenDeck }) {
  const [decks, setDecks] = useState(null);
  const [game, setGame] = useState("");

  const load = async () => {
    let q = supabase.from("decks").select(DECK_SELECT).order("updated_at", { ascending: false });
    if (game) q = q.eq("game", game);
    const { data } = await q;
    setDecks(data || []);
  };
  useEffect(() => { load(); }, [game]);

  if (openDeck) return <DeckEditor id={openDeck} onClose={() => { setOpenDeck(null); load(); }} />;

  return (
    <div className="stack">
      <div className="spread">
        <select value={game} onChange={e => setGame(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">All games</option>
          {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <span className="small muted">Import new decks from the Meta Decks tab.</span>
      </div>
      <div className="card scroll-x">
        <table>
          <thead><tr><th>Deck</th><th>Price</th><th>Built</th><th>Can build</th><th>Linked</th><th>Status</th></tr></thead>
          <tbody>
            {(decks || []).map(d => {
              const { price } = deckPricing(d, d.deck_cards);
              const linked = d.deck_cards.filter(c => c.card_id).length;
              return (
                <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => setOpenDeck(d.id)}>
                  <td><strong>{d.name}</strong><div className="small muted">{gameLabel(d.game)} {d.format && `· ${d.format}`} {d.source_placing && `· ${d.source_placing}`} {d.source_player}</div></td>
                  <td>{money(price)}</td>
                  <td>{d.quantity}</td>
                  <td>{buildableCopies(d.deck_cards)}</td>
                  <td><span className={`badge ${linked === d.deck_cards.length ? "ok" : "warn"}`}>{linked}/{d.deck_cards.length}</span></td>
                  <td>
                    {d.published ? <span className="badge ok">Live</span> : <span className="badge">Draft</span>}{" "}
                    {d.preorder_enabled && <span className="badge warn">Pre-orders on</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {decks && !decks.length && <p className="muted">No decks yet.</p>}
      </div>
    </div>
  );
}

function DeckEditor({ id, onClose }) {
  const [deck, setDeck] = useState(null);
  const [form, setForm] = useState(null);
  const [copies, setCopies] = useState(1);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("decks").select(DECK_SELECT).eq("id", id).single();
    if (error) return setError(error.message);
    data.deck_cards.sort((a, b) => a.sort - b.sort);
    setDeck(data);
    setForm({ ...data, price: data.price ?? "", preorder_limit: data.preorder_limit ?? "", set_release_date: data.set_release_date ?? "" });
  };
  useEffect(() => { load(); }, [id]);

  const run = async (fn, okMsg) => {
    setError(""); setMsg("");
    try { const r = await fn(); setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); await load(); }
    catch (e) { setError(e.message || String(e)); }
  };
  const check = ({ data, error }) => { if (error) throw error; return data; };

  const pricing = useMemo(() => deck && deckPricing({ ...deck, price: form.price === "" ? null : form.price, discount_pct: form.discount_pct }, deck.deck_cards), [deck, form]);
  const rows = useMemo(() => deck ? shortfall(deck.deck_cards, Math.max(1, copies)) : [], [deck, copies]);
  if (error && !deck) return <p className="error">{error}</p>;
  if (!deck) return <p className="muted">Loading…</p>;

  const set = k => e => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const save = () => run(async () => {
    const fields = ["name", "game", "format", "archetype", "description", "discount_pct", "quantity", "published",
      "source_name", "source_url", "source_event", "source_player", "source_placing", "image_url",
      "preorder_enabled", "preorder_eta", "featured_set"];
    const patch = Object.fromEntries(fields.map(k => [k, form[k]]));
    patch.price = form.price === "" ? null : Number(form.price);
    patch.discount_pct = Number(form.discount_pct) || 0;
    patch.quantity = parseInt(form.quantity, 10) || 0;
    patch.target_stock = Math.max(0, parseInt(form.target_stock, 10) || 0);
    patch.preorder_limit = form.preorder_limit === "" || form.preorder_limit == null ? null : Math.max(0, parseInt(form.preorder_limit, 10) || 0);
    patch.set_release_date = form.set_release_date || null;
    patch.updated_at = new Date().toISOString();
    if (patch.published && !(patch.price > 0 || pricing.price > 0)) throw new Error("Set a price, or link every card so the price can be computed, before publishing.");
    check(await supabase.from("decks").update(patch).eq("id", id));
  }, "Saved.");

  const short = rows.filter(r => r.short > 0);
  const buildable = buildableCopies(deck.deck_cards);
  const unlinked = deck.deck_cards.filter(c => !c.card_id).length;

  return (
    <div className="stack">
      <div className="spread">
        <button className="btn small" onClick={onClose}>← All decks</button>
        <div className="row">
          <button className="btn small danger" onClick={async () => {
            if (!confirm(`Delete "${deck.name}"? This does not return built copies' cards to singles inventory.`)) return;
            const { error } = await supabase.from("decks").delete().eq("id", id);
            if (error) setError(error.message); else onClose();
          }}>Delete deck</button>
        </div>
      </div>
      {msg && <div className="badge ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="card stack">
        <div className="form-grid">
          <div><label>Name</label><input value={form.name} onChange={set("name")} /></div>
          <div><label>Game</label><select value={form.game} onChange={set("game")}>{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
          <div><label>Format</label><input value={form.format} onChange={set("format")} /></div>
          <div><label>Archetype</label><input value={form.archetype} onChange={set("archetype")} /></div>
          <div><label>Fixed price (blank = from singles)</label><input type="number" step="0.01" min="0" value={form.price} onChange={set("price")} /></div>
          <div><label>Discount vs singles %</label><input type="number" step="1" min="0" max="99" value={form.discount_pct} onChange={set("discount_pct")} /></div>
          <div><label>Built copies on shelf</label><input type="number" min="0" value={form.quantity} onChange={set("quantity")} /></div>
          <div><label>Image URL</label><input value={form.image_url || ""} onChange={set("image_url")} /></div>
          <div><label>Event</label><input value={form.source_event} onChange={set("source_event")} /></div>
          <div><label>Player</label><input value={form.source_player} onChange={set("source_player")} /></div>
          <div><label>Placing</label><input value={form.source_placing} onChange={set("source_placing")} /></div>
          <div><label>Source URL</label><input value={form.source_url} onChange={set("source_url")} /></div>
          <div><label>Newest set in deck</label><input value={form.featured_set} onChange={set("featured_set")} placeholder="e.g. Surging Sparks" /></div>
          <div><label>Set release date</label><input type="date" value={form.set_release_date} onChange={set("set_release_date")} /></div>
          <div><label>Keep on shelf (target)</label><input type="number" min="0" value={form.target_stock} onChange={set("target_stock")} /></div>
        </div>
        <div className="form-grid">
          <label className="row" style={{ margin: 0, color: "var(--text)", alignSelf: "end" }}>
            <input type="checkbox" checked={form.preorder_enabled} onChange={set("preorder_enabled")} style={{ width: "auto" }} /> Take pre-orders when sold out
          </label>
          <div><label>Pre-order cap (blank = no cap)</label><input type="number" min="0" value={form.preorder_limit} onChange={set("preorder_limit")} disabled={!form.preorder_enabled} /></div>
          <div><label>Ships (shown to customers)</label><input value={form.preorder_eta} onChange={set("preorder_eta")} placeholder="e.g. Nov 15 / 2 weeks after release" disabled={!form.preorder_enabled} /></div>
        </div>
        <div><label>Description (shown on the store)</label><textarea style={{ minHeight: 70, fontFamily: "inherit" }} value={form.description} onChange={set("description")} /></div>
        <div className="spread">
          <label className="row" style={{ margin: 0, color: "var(--text)" }}>
            <input type="checkbox" checked={form.published} onChange={set("published")} style={{ width: "auto" }} /> Published on store
          </label>
          <div className="row">
            <span>Singles value {money(pricing.singlesTotal)}{!pricing.complete && " (incomplete)"} → <strong>Price {money(pricing.price)}</strong></span>
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="spread">
          <h3 style={{ margin: 0 }}>Build from singles</h3>
          <span className="small muted">{deckSize(deck.deck_cards)} cards · {unlinked} unlinked · can build {buildable} now</span>
        </div>
        <div className="row">
          <label style={{ margin: 0 }}>Copies</label>
          <input type="number" min="1" value={copies} onChange={e => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))} style={{ width: 80 }} />
          <button className="btn primary" disabled={unlinked > 0 || buildable < copies}
            onClick={() => run(async () => check(await supabase.rpc("build_deck", { p_deck: id, p_copies: copies })), q => `Built ${copies}. ${q} on shelf.`)}>
            Build {copies} (pull singles)
          </button>
          <button className="btn" title="Fill paid pre-orders for this deck from built copies, oldest first"
            onClick={() => run(async () => check(await supabase.rpc("allocate_preorders", { p_deck: id })), n => n ? `Filled ${n} pre-ordered cop${n === 1 ? "y" : "ies"} from the shelf. Ship them from the Orders tab.` : "No paid pre-orders could be filled (none waiting, or not enough built copies).")}>
            Fill pre-orders from shelf
          </button>
          <button className="btn" onClick={() => run(() => rematchDeck(id, deck.game), n => `Re-linked ${n} card(s) to inventory.`)}>Re-match to inventory</button>
          <button className="btn" onClick={() => navigator.clipboard.writeText(formatDecklist(deck.deck_cards))}>Copy decklist</button>
          {short.length > 0 && (
            <button className="btn" onClick={() => navigator.clipboard.writeText(short.map(r => `${r.short} ${r.name}${r.set_code ? ` ${r.set_code} ${r.number}` : ""}`).join("\n"))}>
              Copy buy list ({short.reduce((s, r) => s + r.short, 0)} cards)
            </button>
          )}
        </div>
        <div className="scroll-x">
          <table>
            <thead><tr><th>Section</th><th>Qty</th><th>Card</th><th>Linked single</th><th>Price</th><th>Need</th><th>Have</th><th>Short</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="small">{r.section}</td>
                  <td>{r.count}</td>
                  <td>{r.name} <span className="small muted">{r.set_code} {r.number !== r.name ? r.number : ""}</span></td>
                  <td className="small">{r.card ? `${r.card.name} ${r.card.set_code} ${r.card.number}` : <span className="badge warn">not in inventory</span>}</td>
                  <td>{r.card ? money(r.card.price) : "—"}</td>
                  <td>{r.need}</td>
                  <td>{r.have}</td>
                  <td>{r.short > 0 ? <span className="badge bad">{r.short}</span> : <span className="badge ok">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unlinked > 0 && <p className="small muted">Add the missing cards on the Singles Inventory tab (bulk-paste the buy list once you have them), then click <em>Re-match to inventory</em>.</p>}
      </div>
    </div>
  );
}
