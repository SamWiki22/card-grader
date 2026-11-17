import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import SignIn from "../../components/SignIn";
import { useMe, postJSON } from "../../lib/me";
import { GAMES, GAME_LABEL, money } from "../../lib/shared";

const TYPES = { single: "Single", box: "Box", pack: "Pack" };
const photoUrl = it => `/api/admin/item-photo/${encodeURIComponent(it.id)}?v=${it.updated_at ? new Date(it.updated_at).getTime() : 0}`;

// Load a photo, turn it 90° (dir = -1 left, 1 right), and return a JPEG data URL.
// Returns null if `onlyIfSideways` and the photo is already taller than wide.
function rotatePhoto(src, dir, onlyIfSideways = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (onlyIfSideways && img.naturalWidth <= img.naturalHeight) return resolve(null);
      const c = document.createElement("canvas");
      c.width = img.naturalHeight; c.height = img.naturalWidth;
      const ctx = c.getContext("2d");
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(dir * Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => reject(new Error("Couldn’t load that photo."));
    img.src = src;
  });
}

export default function StoreAdmin() {
  const me = useMe();
  const [items, setItems] = useState(null);
  const [denied, setDenied] = useState("");
  const [q, setQ] = useState("");
  const [game, setGame] = useState("");
  const [type, setType] = useState("");
  const [stock, setStock] = useState("in");
  const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/items");
    const d = await r.json();
    if (!r.ok) return setDenied(d.error || "Not allowed");
    setItems(d.items);
  }, []);
  useEffect(() => { if (me.user) load(); }, [me.user, load]);

  const shown = useMemo(() => {
    if (!items) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(it =>
      (!game || it.game === game) &&
      (!type || (type === "sealed" ? it.type !== "single" : it.type === type)) &&
      (stock === "all" || (stock === "in" ? it.quantity > 0 : it.quantity <= 0)) &&
      terms.every(t => `${it.name} ${it.set_name} ${it.sku}`.toLowerCase().includes(t))
    );
  }, [items, q, game, type, stock]);

  async function act(body, ok) {
    setMsg("");
    try { const r = await postJSON("/api/admin/items", body); await load(); if (ok) setMsg(typeof ok === "function" ? ok(r) : ok); return true; }
    catch (e) { setMsg(`Error: ${e.message}`); return false; }
  }

  async function rotate(it, dir) {
    setBusy(it.id);
    try {
      const photo = await rotatePhoto(photoUrl(it), dir);
      await postJSON("/api/admin/items", { action: "set-photo", id: it.id, photo });
      await load();
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setBusy("");
  }

  // Turn every sideways (wider-than-tall) photo in the selection — or the whole filtered list.
  async function fixSideways(dir) {
    const targets = (selected.length ? shown.filter(it => selected.includes(it.id)) : shown);
    let fixed = 0, done = 0;
    for (const it of targets) {
      setBusy(`Checking photos… ${++done}/${targets.length}`);
      try {
        const photo = await rotatePhoto(photoUrl(it), dir, true);
        if (photo) { await postJSON("/api/admin/items", { action: "set-photo", id: it.id, photo }); fixed++; }
      } catch { /* no photo — skip */ }
    }
    setBusy("");
    await load();
    setMsg(`Turned ${fixed} sideways photo${fixed === 1 ? "" : "s"} ${dir < 0 ? "left" : "right"}. If any came out upside-down, use that card’s ⟲ ⟳ buttons.`);
  }

  if (!me.loading && !me.user) return <Layout title="Admin"><section className="wrap section"><p>Sign in with an admin email.</p></section><SignIn onClose={() => {}} /></Layout>;
  if (denied) return <Layout title="Admin"><section className="wrap section"><p className="error">{denied}</p></section></Layout>;
  if (!items) return <Layout title="Admin"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  const allShownSelected = shown.length > 0 && shown.every(it => selected.includes(it.id));
  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  return (
    <Layout title="Store inventory">
      <section className="wrap section admin">
        <div className="admin-head">
          <h1 className="page-title">Store inventory</h1>
          <Link href="/admin/packs" className="btn btn-small btn-ghost-dark">Packs admin →</Link>
        </div>
        <p className="muted small">The same items as BB Inventory — changes here show up there and on the store right away. Anything with quantity 0 or price $0 is hidden from shoppers.</p>
        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}

        <div className="inv-filters">
          <input className="input" type="search" placeholder="Search name, set, SKU…" value={q} onChange={e => setQ(e.target.value)} />
          <select className="input" value={game} onChange={e => setGame(e.target.value)}><option value="">All games</option>{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          <select className="input" value={type} onChange={e => setType(e.target.value)}><option value="">Singles &amp; sealed</option><option value="single">Singles</option><option value="sealed">Sealed</option></select>
          <select className="input" value={stock} onChange={e => setStock(e.target.value)}><option value="in">In stock</option><option value="out">Sold out / hidden</option><option value="all">Everything</option></select>
        </div>

        <div className="inv-bulk">
          <label className="check"><input type="checkbox" checked={allShownSelected} onChange={() => setSelected(allShownSelected ? [] : shown.map(it => it.id))} /><span>{selected.length ? `${selected.length} selected` : `Select all ${shown.length}`}</span></label>
          <button className="btn btn-small btn-ghost-dark" disabled={!selected.length} onClick={async () => { if (confirm(`Hide ${selected.length} item(s) by setting quantity to 0? Nothing is deleted.`)) { if (await act({ action: "set-quantity", ids: selected, quantity: 0 }, r => `${r.count} item(s) set to 0 — hidden from the store.`)) setSelected([]); } }}>Mark sold out</button>
          <span className="inv-sep" />
          <span className="small muted">Sideways photos ({selected.length ? "selected" : "everything shown"}):</span>
          <button className="btn btn-small btn-ghost-dark" disabled={!!busy} onClick={() => fixSideways(-1)}>⟲ Turn left</button>
          <button className="btn btn-small btn-ghost-dark" disabled={!!busy} onClick={() => fixSideways(1)}>⟳ Turn right</button>
          {busy && busy.startsWith("Checking") && <span className="small">{busy}</span>}
        </div>

        <div className="inv-grid">
          {shown.map(it => <ItemCard key={`${it.id}-${it.updated_at}`} it={it} selected={selected.includes(it.id)} onToggle={() => toggle(it.id)} busy={busy === it.id} onRotate={dir => rotate(it, dir)} act={act} />)}
        </div>
        {!shown.length && <p className="muted">No items match.</p>}
      </section>
    </Layout>
  );
}

function ItemCard({ it, selected, onToggle, busy, onRotate, act }) {
  const [f, setF] = useState({ name: it.name, set_name: it.set_name, condition: it.condition, quantity: it.quantity, price: it.price, game: it.game || "other" });
  const [noPhoto, setNoPhoto] = useState(false);
  const dirty = Object.keys(f).some(k => String(f[k] ?? "") !== String(it[k] ?? (k === "game" ? "other" : "")));
  const bind = k => ({ value: f[k] ?? "", onChange: e => setF({ ...f, [k]: e.target.value }) });
  const listed = it.quantity > 0 && Number(it.price) > 0;

  return (
    <article className={`inv-card${selected ? " picked" : ""}${listed ? "" : " hidden-item"}`}>
      <div className="inv-photo">
        {noPhoto ? <div className="inv-nophoto">No photo</div> : <img src={photoUrl(it)} alt="" onError={() => setNoPhoto(true)} />}
        <label className="inv-select"><input type="checkbox" checked={selected} onChange={onToggle} /></label>
        {!noPhoto && (
          <div className="inv-rotate">
            <button onClick={() => onRotate(-1)} disabled={busy} title="Turn left" aria-label="Turn photo left">⟲</button>
            <button onClick={() => onRotate(1)} disabled={busy} title="Turn right" aria-label="Turn photo right">⟳</button>
          </div>
        )}
        <span className={`inv-status ${listed ? "on" : ""}`}>{listed ? "Listed" : it.quantity <= 0 ? "Sold out" : "No price"}</span>
      </div>
      <div className="inv-fields">
        <input className="input input-sm" {...bind("name")} aria-label="Name" />
        <input className="input input-sm" {...bind("set_name")} placeholder="Set" aria-label="Set" />
        <div className="inv-row">
          <select className="input input-sm" {...bind("game")} aria-label="Game">{GAMES.map(g => <option key={g.id} value={g.id}>{GAME_LABEL[g.id]}</option>)}</select>
          <input className="input input-sm" {...bind("condition")} placeholder="Cond." aria-label="Condition" />
        </div>
        <div className="inv-row">
          <div className="qty qty-small">
            <button onClick={() => setF({ ...f, quantity: Math.max(0, Number(f.quantity) - 1) })} aria-label="Less">−</button>
            <span>{f.quantity}</span>
            <button onClick={() => setF({ ...f, quantity: Number(f.quantity) + 1 })} aria-label="More">+</button>
          </div>
          <span className="money-input">$<input className="input input-sm num" type="number" step="0.01" min="0" {...bind("price")} aria-label="Price" /></span>
        </div>
        <div className="inv-actions">
          {dirty
            ? <button className="btn btn-small" onClick={() => act({ action: "update", id: it.id, fields: f }, `Saved ${f.name}.`)}>Save</button>
            : <span className="small muted">{TYPES[it.type] || it.type}{it.sku ? ` · ${it.sku}` : ""}</span>}
          <button className="btn btn-small btn-ghost-dark" disabled={it.quantity <= 0 || dirty} title={dirty ? "Save your edits first" : ""}
            onClick={() => act({ action: "sold", id: it.id, qty: 1 }, `Sold 1 × ${it.name} for ${money(it.price)} — logged in BB Inventory sales.`)}>Sold 1</button>
        </div>
      </div>
    </article>
  );
}
