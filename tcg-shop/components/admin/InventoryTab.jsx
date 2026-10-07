import { useEffect, useState } from "react";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import { GAMES, gameLabel } from "../../lib/games";
import { parseDecklist } from "../../lib/decklist";
import { buildIndex, matchCard } from "../../lib/match";
import { money } from "../../lib/pricing";

const BLANK = { game: "pokemon", name: "", set_code: "", number: "", rarity: "", condition: "NM", finish: "", price: "", quantity: 1, image_url: "" };
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

export default function InventoryTab() {
  const [rows, setRows] = useState([]);
  const [game, setGame] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(BLANK);
  const [bulk, setBulk] = useState({ open: false, game: "pokemon", text: "", price: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await fetchAll(() => {
        let query = supabase.from("cards").select("*").order("name").order("id");
        if (game) query = query.eq("game", game);
        if (q.trim()) query = query.ilike("name", `%${q.trim().replace(/[%_]/g, "")}%`);
        return query;
      });
      setRows(data);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [game, q]);

  const flash = m => { setMsg(m); setError(""); setTimeout(() => setMsg(""), 2500); };

  const add = async e => {
    e.preventDefault();
    const { error } = await supabase.from("cards").insert({ ...form, price: Number(form.price) || 0, quantity: parseInt(form.quantity, 10) || 0 });
    if (error) return setError(error.message);
    setForm({ ...BLANK, game: form.game, set_code: form.set_code, condition: form.condition });
    flash("Added.");
    load();
  };

  const update = async (id, patch) => {
    setRows(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("cards").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { setError(error.message); load(); }
  };

  const remove = async id => {
    if (!confirm("Delete this card from inventory?")) return;
    const { error } = await supabase.from("cards").delete().eq("id", id);
    if (error) return setError(error.message);
    load();
  };

  // Bulk intake: paste a list ("4 Arven SVI 166"); existing printings get quantity added, new ones are created.
  const bulkAdd = async () => {
    setError("");
    try {
      const parsed = parseDecklist(bulk.text, { game: bulk.game });
      const existing = await fetchAll(() => supabase.from("cards").select("id,name,set_code,number,quantity,price,condition").eq("game", bulk.game).order("id"));
      const index = buildIndex(existing.filter(c => c.condition === "NM"));
      let added = 0, created = 0;
      for (const c of parsed) {
        const hit = c.set_code || c.number ? matchCard(c, index) : null;
        const exact = hit && (!c.set_code || hit.set_code.toUpperCase() === c.set_code.toUpperCase()) ? hit : null;
        if (exact) {
          const { error } = await supabase.from("cards").update({ quantity: exact.quantity + c.count, updated_at: new Date().toISOString() }).eq("id", exact.id);
          if (error) throw error;
          exact.quantity += c.count;
          added++;
        } else {
          const { error } = await supabase.from("cards").insert({
            game: bulk.game, name: c.name, set_code: c.set_code, number: c.number, quantity: c.count, price: Number(bulk.price) || 0, condition: "NM",
          });
          if (error) throw error;
          created++;
        }
      }
      setBulk({ ...bulk, text: "" });
      flash(`Restocked ${added} existing, created ${created} new.`);
      load();
    } catch (e) { setError(e.message); }
  };

  const set = k => e => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="stack">
      <form className="card stack" onSubmit={add}>
        <div className="spread"><h3 style={{ margin: 0 }}>Add single</h3>
          <button type="button" className="btn small" onClick={() => setBulk({ ...bulk, open: !bulk.open })}>{bulk.open ? "Close bulk add" : "Bulk add from list"}</button></div>
        <div className="form-grid">
          <div><label>Game</label><select value={form.game} onChange={set("game")}>{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
          <div><label>Name *</label><input required value={form.name} onChange={set("name")} /></div>
          <div><label>Set code</label><input value={form.set_code} onChange={set("set_code")} placeholder="SVI / MH3 / OP05" /></div>
          <div><label>Number</label><input value={form.number} onChange={set("number")} /></div>
          <div><label>Rarity</label><input value={form.rarity} onChange={set("rarity")} /></div>
          <div><label>Finish</label><input value={form.finish} onChange={set("finish")} placeholder="Foil / Reverse holo" /></div>
          <div><label>Condition</label><select value={form.condition} onChange={set("condition")}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></div>
          <div><label>Price</label><input type="number" step="0.01" min="0" value={form.price} onChange={set("price")} /></div>
          <div><label>Qty</label><input type="number" min="0" value={form.quantity} onChange={set("quantity")} /></div>
          <div><label>Image URL</label><input value={form.image_url} onChange={set("image_url")} /></div>
        </div>
        <div><button className="btn primary">Add</button></div>
      </form>

      {bulk.open && (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Bulk add (NM)</h3>
          <p className="small muted">Paste one card per line, e.g. <code>4 Arven SVI 166</code> or a deck&apos;s buy list. Matching printings are restocked; new ones are created at the default price.</p>
          <div className="form-grid">
            <div><label>Game</label><select value={bulk.game} onChange={e => setBulk({ ...bulk, game: e.target.value })}>{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></div>
            <div><label>Default price for new cards</label><input type="number" step="0.01" value={bulk.price} onChange={e => setBulk({ ...bulk, price: e.target.value })} /></div>
          </div>
          <textarea value={bulk.text} onChange={e => setBulk({ ...bulk, text: e.target.value })} />
          <div><button className="btn primary" onClick={bulkAdd} disabled={!bulk.text.trim()}>Add {parseDecklist(bulk.text, { game: bulk.game }).length} lines</button></div>
        </div>
      )}

      {msg && <div className="badge ok">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="row">
        <select value={game} onChange={e => setGame(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">All games</option>
          {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 300 }} />
        <span className="small muted">{rows.length} rows · {rows.reduce((s, r) => s + r.quantity, 0)} cards · {money(rows.reduce((s, r) => s + r.quantity * r.price, 0))} retail</span>
      </div>
      <div className="card scroll-x">
        <table>
          <thead><tr><th>Card</th><th>Cond.</th><th style={{ width: 100 }}>Price</th><th style={{ width: 80 }}>Qty</th><th /></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong><div className="small muted">{gameLabel(r.game)} · {[r.set_code, r.number, r.rarity, r.finish].filter(Boolean).join(" · ")}</div></td>
                <td>{r.condition}</td>
                <td><input type="number" step="0.01" min="0" defaultValue={r.price} onBlur={e => Number(e.target.value) !== Number(r.price) && update(r.id, { price: Number(e.target.value) || 0 })} /></td>
                <td><input type="number" min="0" defaultValue={r.quantity} onBlur={e => parseInt(e.target.value, 10) !== r.quantity && update(r.id, { quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })} /></td>
                <td><button className="btn small danger" onClick={() => remove(r.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
