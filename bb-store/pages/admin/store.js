import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import SignIn from "../../components/SignIn";
import { AdminGate } from "../../components/TeamLogin";
import TcgPicker from "../../components/TcgPicker";
import { useMe, postJSON, accessOf } from "../../lib/me";
import { GAMES, GAME_LABEL, money } from "../../lib/shared";

const TYPES = { single: "Single", box: "Box", pack: "Pack" };
const OWNERS = [{ id: "sam", label: "Sam" }, { id: "bear_umer", label: "Bear / Umer" }, { id: "shared", label: "Shared 50/50" }];
const OWNER_LABEL = Object.fromEntries(OWNERS.map(o => [o.id, o.label]));
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG", "PSA 10", "PSA 9", "BGS 9.5", "CGC 10"];
const PREFS = "bb-add-prefs"; // remembered per browser: game, owner, condition
const photoUrl = it => `/api/admin/item-photo/${encodeURIComponent(it.id)}?v=${it.updated_at ? new Date(it.updated_at).getTime() : 0}`;

// Shrink a photo (File or data URL) to `max` px JPEG. Browsers apply the phone's
// rotation flag when drawing, so the result comes out upright.
export function shrink(src, max = 900, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      if (typeof src !== "string") URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("That file isn’t a photo we can read."));
    img.src = typeof src === "string" ? src : URL.createObjectURL(src);
  });
}

// Shrink a photo to max 900px JPEG. Browsers apply the phone's rotation flag when
// drawing, so the saved photo comes out upright.
function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

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
      try { resolve(c.toDataURL("image/jpeg", 0.9)); } catch { reject(new Error("TCGplayer photos are already upright and can’t be rotated.")); }
    };
    img.onerror = () => reject(new Error("Couldn’t load that photo."));
    img.src = src;
  });
}

export default function Inventory() {
  const me = useMe();
  const [items, setItems] = useState(null);
  const [denied, setDenied] = useState("");
  const [q, setQ] = useState("");
  const [game, setGame] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [stock, setStock] = useState("in");
  const [selected, setSelected] = useState([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState(false);
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/items");
    const d = await r.json();
    if (!r.ok) return setDenied(d.error || "Not allowed");
    setItems(d.items);
  }, []);
  useEffect(() => { if (me.user || me.team) load(); }, [me.user, me.team, load]);

  const shown = useMemo(() => {
    if (!items) return [];
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(it =>
      (!game || it.game === game) &&
      (!type || (type === "sealed" ? it.type !== "single" : it.type === type)) &&
      (!owner || (owner === "none" ? !OWNER_LABEL[it.owner] : it.owner === owner)) &&
      (stock === "all" || (stock === "in" ? it.quantity > 0 : it.quantity <= 0)) &&
      terms.every(t => `${it.name} ${it.set_name} ${it.sku}`.toLowerCase().includes(t))
    );
  }, [items, q, game, type, owner, stock]);

  const totals = useMemo(() => {
    const inStock = (items || []).filter(it => it.quantity > 0);
    return {
      units: inStock.reduce((s, it) => s + it.quantity, 0),
      retail: inStock.reduce((s, it) => s + it.quantity * Number(it.price || 0), 0),
      cost: inStock.reduce((s, it) => s + it.quantity * Number(it.cost || 0), 0),
    };
  }, [items]);

  async function act(body, ok) {
    setMsg("");
    try { const r = await postJSON("/api/admin/items", body); await load(); if (ok) setMsg(typeof ok === "function" ? ok(r) : ok); return r; }
    catch (e) { setMsg(`Error: ${e.message}`); return null; }
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
    const targets = selected.length ? shown.filter(it => selected.includes(it.id)) : shown;
    let fixed = 0, done = 0;
    for (const it of targets) {
      setBusy(`Checking photos… ${++done}/${targets.length}`);
      try {
        const photo = await rotatePhoto(photoUrl(it), dir, true);
        if (photo) { await postJSON("/api/admin/items", { action: "set-photo", id: it.id, photo }); fixed++; }
      } catch { /* no photo, or a TCGplayer photo — skip */ }
    }
    setBusy("");
    await load();
    setMsg(`Turned ${fixed} sideways photo${fixed === 1 ? "" : "s"} ${dir < 0 ? "left" : "right"}. If any came out upside-down, use that card’s ⟲ ⟳ buttons.`);
  }

  if (!me.loading && !me.user && !me.team) return <Layout title="Inventory"><AdminGate /></Layout>;
  if (denied) return <Layout title="Inventory"><section className="wrap section"><p className="error">{denied}</p></section></Layout>;
  if (!items) return <Layout title="Inventory"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  const allShownSelected = shown.length > 0 && shown.every(it => selected.includes(it.id));
  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  return (
    <Layout title="Inventory">
      <section className="wrap section admin">
        <div className="admin-head">
          <h1 className="page-title">Inventory</h1>
          <span className="admin-links">
            <Link href="/admin/offers" className="btn btn-small btn-ghost-dark">Offers{me.new_customer_offers ? ` (${me.new_customer_offers} new)` : ""} →</Link>
            {accessOf(me).admin && <><Link href="/admin/sales" className="btn btn-small btn-ghost-dark">Sales →</Link> <Link href="/admin/packs" className="btn btn-small btn-ghost-dark">Packs admin →</Link></>}
          </span>
        </div>
        <div className="inv-stats">
          <div><span className="muted small">In stock</span><b>{totals.units}</b></div>
          <div><span className="muted small">Retail value</span><b>{money(totals.retail)}</b></div>
          <div><span className="muted small">Cost</span><b>{money(totals.cost)}</b></div>
        </div>

        {adding && <AddPanel onClose={() => setAdding(false)} onAdded={async (name, qty) => { await load(); setMsg(`Added ${qty} × ${name}.`); }} />}
        {recording && <RecordSales items={items} onClose={() => setRecording(false)} onDone={async n => { await load(); setMsg(`Recorded ${n} sale${n === 1 ? "" : "s"}.`); }} />}
        {!adding && !recording && (
          <div className="inv-top-actions">
            <button className="btn" onClick={() => { setAdding(true); setMsg(""); }}>+ Add cards or sealed</button>
            <button className="btn btn-ghost-dark" onClick={() => { setRecording(true); setMsg(""); }}>📷 Record sales</button>
          </div>
        )}

        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}

        <div className="inv-filters">
          <input className="input" type="search" placeholder="Search name, set, SKU…" value={q} onChange={e => setQ(e.target.value)} />
          <select className="input" value={game} onChange={e => setGame(e.target.value)}><option value="">All games</option>{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          <select className="input" value={type} onChange={e => setType(e.target.value)}><option value="">Singles &amp; sealed</option><option value="single">Singles</option><option value="sealed">Sealed</option></select>
          <select className="input" value={owner} onChange={e => setOwner(e.target.value)}><option value="">All owners</option>{OWNERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}<option value="none">No owner set</option></select>
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

// Fast entry: find on TCGplayer (remembers the set) → set qty / condition / owner → Add, repeat.
function AddPanel({ onClose, onAdded }) {
  const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } })();
  const blank = { type: "single", game: prefs.game || "pokemon", owner: prefs.owner || "", condition: prefs.condition || "NM", name: "", set_name: "", quantity: 1, price: "", cost: "", notes: "", photo: "", tcg: null };
  const [f, setF] = useState(blank);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState([]); // everything the photo showed (more than one card → pick which)
  const [hint, setHint] = useState({ q: "", set: "" });
  const bind = k => ({ value: f[k] ?? "", onChange: e => setF({ ...f, [k]: e.target.value }) });

  function useFound(it, photo) {
    setF(cur => ({
      ...cur,
      type: it.type, game: it.game,
      name: it.number && !it.name.includes(it.number) ? `${it.name} ${it.number}` : it.name,
      set_name: it.set,
      condition: it.type === "single" ? (it.condition || cur.condition || "NM") : "",
      quantity: it.quantity || 1,
      price: it.price ? it.price.toFixed(2) : cur.price,
      notes: it.notes,
      photo: photo ?? cur.photo,
      tcg: null,
    }));
    setHint({ q: it.number || it.name, set: it.set });
  }

  // 📷 Snap to add: read the photo, fill the form, keep the photo as the item's picture.
  async function onSnap(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true); setError(""); setFound([]);
    try {
      const [forAi, photo] = await Promise.all([shrink(file, 1400), shrink(file, 900)]);
      const r = await postJSON("/api/admin/read-photo", { image: forAi, mode: "add" });
      if (!r.items.length) throw new Error("Couldn’t find a card in that photo — try again closer up.");
      setFound(r.items.map(it => ({ ...it, photo })));
      useFound(r.items[0], photo);
    } catch (err) { setError(err.message); }
    setReading(false);
  }

  function fromTcg(t) {
    setPicker(false);
    setF(cur => ({
      ...cur,
      type: t.sealed ? (/\bpack\b/i.test(t.name) && !/box|bundle|case|display/i.test(t.name) ? "pack" : "box") : "single",
      game: TCG_GAME[t.categoryId] || cur.game,
      condition: t.sealed ? "" : cur.condition || "NM",
      name: t.sealed || !t.number ? t.name : `${t.name} ${t.number}`.replace(/ - (\S+) (\1)$/, " $1"),
      set_name: t.setName,
      price: (t.cents / 100).toFixed(2),
      photo: cur.photo && cur.photo.startsWith("data:") ? cur.photo : t.imageUrl, // keep a real photo you just took
      tcg: t,
    }));
  }
  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (file) setF({ ...f, photo: await compress(file) });
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await postJSON("/api/admin/items", { action: "create", fields: f, tcg: f.tcg });
      try { localStorage.setItem(PREFS, JSON.stringify({ game: f.game, owner: f.owner, condition: f.type === "single" ? f.condition : prefs.condition })); } catch {}
      await onAdded(f.name, f.quantity);
      const rest = found.slice(1);
      setF({ ...blank, game: f.game, owner: f.owner, condition: f.type === "single" ? f.condition : blank.condition });
      if (rest.length) { setFound(rest); useFound(rest[0], rest[0].photo); } // next card from the same photo
      else { setFound([]); setHint({ q: "", set: "" }); if (f.tcg) setPicker(true); } // next card from the same set
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  return (
    <>
    <form className="add-panel" onSubmit={submit}>
      <div className="add-panel-head">
        <b>Add to inventory</b>
        <button type="button" className="link-button" onClick={onClose}>Close</button>
      </div>
      <div className="add-panel-top">
        <label className="btn snap-btn">{reading ? "Reading photo…" : "📷 Snap to add"}<input type="file" accept="image/*" capture="environment" onChange={onSnap} hidden disabled={reading} /></label>
        <button type="button" className="btn btn-ghost-dark" onClick={() => setPicker(true)}>🔎 Find on TCGplayer</button>
        <span className="muted small">{f.tcg ? `Matched TCGplayer #${f.tcg.productId} · ${f.tcg.subType}` : hint.q ? "Read from your photo — tap Find on TCGplayer to match the price, or check the details and add." : "Snap a photo, search TCGplayer, or type it in below."}</span>
      </div>
      {found.length > 1 && <p className="small">This photo has {found.length} items — adding <b>{found[0].name}</b> first, then the rest one by one.</p>}
      <div className="add-grid">
        <label className={`add-photo${f.photo ? " has" : ""}`}>
          {f.photo ? <img src={f.photo} alt="" /> : <span>📷 Photo<br /><small>optional</small></span>}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
        </label>
        <div className="add-fields">
          <input className="input" placeholder="Name" required {...bind("name")} />
          <input className="input" placeholder="Set" {...bind("set_name")} />
          <div className="add-row">
            <select className="input" {...bind("type")} aria-label="Type">{Object.entries(TYPES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
            <select className="input" {...bind("game")} aria-label="Game">{GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          </div>
          <div className="add-row">
            {f.type === "single" && (
              <><input className="input" list="conds" placeholder="Condition" {...bind("condition")} aria-label="Condition" />
              <datalist id="conds">{CONDITIONS.map(c => <option key={c} value={c} />)}</datalist></>
            )}
            <select className="input" {...bind("owner")} aria-label="Owner"><option value="">Owner…</option>{OWNERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </div>
          <div className="add-row">
            <label className="add-num">Qty<input className="input" type="number" min="0" {...bind("quantity")} /></label>
            <label className="add-num">Price $<input className="input" type="number" step="0.01" min="0" {...bind("price")} /></label>
            <label className="add-num">Cost $<input className="input" type="number" step="0.01" min="0" placeholder="optional" {...bind("cost")} /></label>
          </div>
          {f.tcg && <label className="check small"><input type="checkbox" checked={!!f.tcg.autoPrice} onChange={e => setF({ ...f, tcg: { ...f.tcg, autoPrice: e.target.checked } })} /><span>Keep price synced to TCGplayer market (daily)</span></label>}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-block" disabled={busy}>{busy ? "Adding…" : `Add ${f.quantity || 0} to inventory`}</button>
    </form>
    {picker && <TcgPicker remember allowSealed initialGame={f.game} initialQuery={hint.q} initialSetFilter={hint.set} title="Find on TCGplayer" onPick={fromTcg} onClose={() => setPicker(false)} />}
    </>
  );
}
// TCGplayer category → store game.
const TCG_GAME = { 3: "pokemon", 1: "mtg", 80: "dbs", 27: "dbs", 68: "onepiece", 86: "gundam", 81: "unionarena" };

function ItemCard({ it, selected, onToggle, busy, onRotate, act }) {
  const pick = x => ({ name: x.name, set_name: x.set_name, condition: x.condition, quantity: x.quantity, price: x.price, cost: x.cost, owner: x.owner || "", game: x.game || "other" });
  const [f, setF] = useState(pick(it));
  const [noPhoto, setNoPhoto] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Add or replace this item's photo from the camera or photo library.
  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try { await act({ action: "set-photo", id: it.id, photo: await shrink(file, 900) }, `Photo saved for ${it.name}.`); }
    finally { setUploading(false); }
  }
  const orig = pick(it);
  const dirty = Object.keys(f).some(k => String(f[k] ?? "") !== String(orig[k] ?? ""));
  const bind = k => ({ value: f[k] ?? "", onChange: e => setF({ ...f, [k]: e.target.value }) });
  const listed = it.quantity > 0 && Number(it.price) > 0;

  return (
    <article className={`inv-card${selected ? " picked" : ""}${listed ? "" : " hidden-item"}`}>
      <div className="inv-photo">
        {noPhoto
          ? <label className="inv-addphoto">{uploading ? "Saving…" : <><span className="inv-addphoto-icon">📷</span>Add photo</>}<input type="file" accept="image/*" onChange={onPhoto} hidden disabled={uploading} /></label>
          : <img src={photoUrl(it)} alt="" loading="lazy" onError={() => setNoPhoto(true)} />}
        <label className="inv-select"><input type="checkbox" checked={selected} onChange={onToggle} /></label>
        {!noPhoto && (
          <div className="inv-rotate">
            <button onClick={() => onRotate(-1)} disabled={busy} title="Turn left" aria-label="Turn photo left">⟲</button>
            <button onClick={() => onRotate(1)} disabled={busy} title="Turn right" aria-label="Turn photo right">⟳</button>
            <label className="inv-rotate-btn" title="Replace photo" aria-label="Replace photo">{uploading ? "…" : "📷"}<input type="file" accept="image/*" onChange={onPhoto} hidden disabled={uploading} /></label>
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
        <select className="input input-sm" {...bind("owner")} aria-label="Owner"><option value="">No owner</option>{OWNERS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        <div className="inv-row">
          <div className="qty qty-small">
            <button onClick={() => setF({ ...f, quantity: Math.max(0, Number(f.quantity) - 1) })} aria-label="Less">−</button>
            <span>{f.quantity}</span>
            <button onClick={() => setF({ ...f, quantity: Number(f.quantity) + 1 })} aria-label="More">+</button>
          </div>
          <span className="money-input">$<input className="input input-sm num" type="number" step="0.01" min="0" {...bind("price")} aria-label="Price" disabled={it.price_source === "tcgplayer"} title={it.price_source === "tcgplayer" ? "Synced to TCGplayer market daily" : ""} /></span>
        </div>
        <div className="inv-row small muted">
          <span>Cost $<input className="input input-sm num inv-cost" type="number" step="0.01" min="0" {...bind("cost")} aria-label="Cost" /></span>
          <span>{TYPES[it.type] || it.type}{it.price_source === "tcgplayer" ? " · TCG sync" : ""}</span>
        </div>
        <div className="inv-actions">
          {dirty
            ? <button className="btn btn-small" onClick={() => act({ action: "update", id: it.id, fields: it.price_source === "tcgplayer" ? { ...f, price: undefined } : f }, `Saved ${f.name}.`)}>Save</button>
            : <button className="btn btn-small btn-ghost-dark" disabled={it.quantity <= 0} onClick={() => act({ action: "sold", id: it.id, qty: 1 }, `Sold 1 × ${it.name} for ${money(it.price)}.`)}>Sold 1</button>}
          <button className="link-button" onClick={() => { if (confirm(`Delete "${it.name}" for good? (To just hide it, set quantity to 0.)`)) act({ action: "delete", id: it.id }, `Deleted ${it.name}.`); }}>Delete</button>
        </div>
      </div>
    </article>
  );
}

const SOLD_BY = "bb-sold-by";
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// 📷 Record sales: upload photos / group-text screenshots of what sold → the AI reads each item
// and suggests the matching inventory card → check, adjust, and record them all at once.
function RecordSales({ items, onClose, onDone }) {
  const [rows, setRows] = useState([]); // { key, found, candidates, itemId, qty, price, thumb, search }
  const [reading, setReading] = useState(0);
  const [soldBy, setSoldBy] = useState(() => { try { return localStorage.getItem(SOLD_BY) || ""; } catch { return ""; } });
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const byId = useMemo(() => Object.fromEntries(items.map(it => [it.id, it])), [items]);

  async function onPhotos(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    setError("");
    for (const file of files) {
      setReading(n => n + 1);
      try {
        const [forAi, thumb] = await Promise.all([shrink(file, 1600), shrink(file, 260, 0.6)]);
        const r = await postJSON("/api/admin/read-photo", { image: forAi, mode: "sold" });
        if (!r.matches.length) setError(prev => `${prev ? prev + " " : ""}No sold items were found in one of the photos.`);
        setRows(cur => [...cur, ...r.matches.map((m, i) => {
          const best = m.confident ? m.candidates[0] : null; // weak matches wait for a person to pick
          return { key: `${Date.now()}-${i}-${Math.random()}`, found: m.found, candidates: m.candidates, itemId: best?.id || "", qty: m.found.quantity || 1, price: m.found.price ?? best?.price ?? "", thumb, search: "" };
        })]);
      } catch (err) { setError(err.message); }
      setReading(n => n - 1);
    }
  }

  const set = (key, patch) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const ready = rows.filter(r => r.itemId);

  async function record() {
    setBusy(true); setError("");
    try { localStorage.setItem(SOLD_BY, soldBy); } catch {}
    const soldAt = date === today() ? null : new Date(`${date}T12:00:00`).toISOString();
    let done = 0;
    const failed = [];
    for (const r of ready) {
      try {
        await postJSON("/api/admin/items", { action: "sold", id: r.itemId, qty: r.qty, price: r.price, soldBy, soldAt, thumbnail: r.thumb });
        done++;
        setRows(rs => rs.filter(x => x.key !== r.key));
      } catch (err) { failed.push(`${byId[r.itemId]?.name || r.found.name}: ${err.message}`); }
    }
    setBusy(false);
    if (done) await onDone(done);
    if (failed.length) setError(failed.join(" · ")); else if (done) onClose();
  }

  return (
    <div className="add-panel">
      <div className="add-panel-head"><b>Record sales from photos</b><button type="button" className="link-button" onClick={onClose}>Close</button></div>
      <p className="muted small">Upload photos of what sold, or screenshots of the group text. Each item is matched to inventory — check the matches, fix anything off, then record.</p>
      <div className="add-panel-top">
        <label className="btn snap-btn">{reading ? `Reading ${reading} photo${reading === 1 ? "" : "s"}…` : "📷 Add photos / screenshots"}<input type="file" accept="image/*" multiple onChange={onPhotos} hidden /></label>
      </div>
      {rows.length > 0 && (
        <ul className="sale-rows">
          {rows.map(r => {
            const terms = r.search.toLowerCase().split(/\s+/).filter(Boolean);
            const searchHits = terms.length ? items.filter(it => it.quantity > 0 && terms.every(t => `${it.name} ${it.set_name}`.toLowerCase().includes(t))).slice(0, 8) : [];
            const options = [...r.candidates, ...searchHits.filter(h => !r.candidates.some(c => c.id === h.id))];
            const it = byId[r.itemId];
            return (
              <li key={r.key} className={r.itemId ? "" : "unmatched"}>
                <img src={r.thumb} alt="" />
                <div className="sale-row-body">
                  <div className="small muted">Photo says: <b>{[r.found.name, r.found.number, r.found.set].filter(Boolean).join(" · ")}</b>{r.found.price ? ` · $${r.found.price}` : ""}{r.found.notes ? ` · ${r.found.notes}` : ""}</div>
                  <select className="input input-sm" value={r.itemId} aria-label="Inventory item" onChange={e => { const c = options.find(o => o.id === e.target.value); set(r.key, { itemId: e.target.value, price: r.found.price ?? c?.price ?? r.price }); }}>
                    <option value="">{options.length ? "— pick the card that sold (or skip) —" : "No match — search below"}</option>
                    {options.map(o => <option key={o.id} value={o.id}>{o.name}{o.set_name ? ` · ${o.set_name}` : ""}{o.condition ? ` · ${o.condition}` : ""} · {o.quantity} in stock · {money(o.price)}{o.owner ? ` · ${OWNER_LABEL[o.owner] || ""}` : ""}</option>)}
                  </select>
                  <input className="input input-sm" placeholder="Search inventory…" value={r.search} onChange={e => set(r.key, { search: e.target.value })} />
                  <div className="add-row">
                    <label className="add-num">Qty<input className="input input-sm" type="number" min="1" max={it?.quantity || 99} value={r.qty} onChange={e => set(r.key, { qty: e.target.value })} /></label>
                    <label className="add-num">Sold for $ (each)<input className="input input-sm" type="number" step="0.01" min="0" value={r.price} onChange={e => set(r.key, { price: e.target.value })} /></label>
                    <button type="button" className="link-button" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}>Remove</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && (
        <>
          <div className="add-row">
            <label className="add-num">Sold by<input className="input" placeholder="Your name" value={soldBy} onChange={e => setSoldBy(e.target.value)} /></label>
            <label className="add-num">Date sold<input className="input" type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></label>
          </div>
          <button className="btn btn-block" disabled={busy || !ready.length} onClick={record}>{busy ? "Recording…" : `Record ${ready.length} sale${ready.length === 1 ? "" : "s"} · ${money(ready.reduce((s, r) => s + Number(r.price || 0) * Number(r.qty || 1), 0))}`}</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
