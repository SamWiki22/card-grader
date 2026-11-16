import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import SignIn from "../../components/SignIn";
import { useMe, postJSON } from "../../lib/me";
import { GAME_LABEL, centsToMoney } from "../../lib/shared";

const pct = n => `${(n * 100).toFixed(1)}%`;

// Resize a photo to max 900px JPEG before upload so pack pools stay light.
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

export default function AdminPacks() {
  const me = useMe();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState("");
  const [tierId, setTierId] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/packs");
    const d = await r.json();
    if (!r.ok) return setDenied(d.error || "Not allowed");
    setData(d);
    setTierId(t => t || d.tiers[0]?.id || "");
  }, []);
  useEffect(() => { if (me.user) load(); }, [me.user, load]);

  async function act(body, okMsg) {
    setMsg("");
    try { await postJSON("/api/admin/packs", body); await load(); if (okMsg) setMsg(okMsg); }
    catch (e) { setMsg(`Error: ${e.message}`); }
  }

  if (!me.loading && !me.user) {
    return <Layout title="Admin"><section className="wrap section"><p>Sign in with an admin email.</p></section><SignIn onClose={() => {}} /></Layout>;
  }
  if (denied) return <Layout title="Admin"><section className="wrap section"><p className="error">{denied}</p></section></Layout>;
  if (!data) return <Layout title="Admin"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  const tier = data.tiers.find(t => t.id === tierId);
  const cards = data.cards.filter(c => c.tier_id === tierId);
  const openShipments = data.shipments.filter(s => s.status === "requested");

  return (
    <Layout title="Packs admin">
      <section className="wrap section admin">
        <h1 className="page-title">Packs admin</h1>
        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}

        <h2 className="sub-title">Tiers</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Game</th><th>Tier</th><th>Price</th><th>Pool</th><th>Avg pull value</th><th>House margin</th><th>Live</th><th /></tr></thead>
            <tbody>
              {data.tiers.map(t => <TierRow key={t.id} t={t} active={t.id === tierId} onPick={() => setTierId(t.id)} onSave={b => act({ action: "update-tier", id: t.id, ...b }, "Tier saved.")} />)}
            </tbody>
          </table>
        </div>
        <p className="muted small">House margin = 1 − (average card value pulled ÷ pack price). Below ~10% you’re likely losing money after shipping and fees; negative means every opening costs you on average.</p>

        {tier && (
          <>
            <h2 className="sub-title">{GAME_LABEL[tier.game]} · {tier.name} pool</h2>
            <AddCard tier={tier} onAdd={b => act({ action: "add-card", tier_id: tier.id, ...b }, "Card added to pool.")} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Card</th><th>Grade</th><th>Value</th><th>Weight</th><th>Chance</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {cards.map(c => <CardRow key={c.id} c={c} total={cards.filter(x => x.status === "available").reduce((s, x) => s + Number(x.weight), 0)}
                    onSave={b => act({ action: "update-card", id: c.id, ...b }, "Card updated.")} />)}
                  {!cards.length && <tr><td colSpan={7} className="muted">No cards in this pool yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="sub-title">Shipping requests ({openShipments.length})</h2>
        {!openShipments.length ? <p className="muted">Nothing to ship.</p> : openShipments.map(s => (
          <Shipment key={s.id} s={s} onShip={tracking => act({ action: "mark-shipped", id: s.id, tracking }, `Shipment #${s.id} marked shipped.`)} />
        ))}
      </section>
    </Layout>
  );
}

function TierRow({ t, active, onPick, onSave }) {
  const [name, setName] = useState(t.name);
  const [price, setPrice] = useState((t.price_cents / 100).toFixed(2));
  const [live, setLive] = useState(t.active);
  const dirty = name !== t.name || Math.round(price * 100) !== Number(t.price_cents) || live !== t.active;
  const warn = t.margin !== null && t.margin < 0.1;
  return (
    <tr className={active ? "row-active" : ""}>
      <td>{GAME_LABEL[t.game]}</td>
      <td><input className="input input-sm" value={name} onChange={e => setName(e.target.value)} /></td>
      <td><input className="input input-sm num" type="number" step="0.01" min="0.5" value={price} onChange={e => setPrice(e.target.value)} /></td>
      <td>{t.poolSize}</td>
      <td>{t.poolSize ? centsToMoney(t.evCents) : "—"}</td>
      <td className={warn ? "neg" : ""}>{t.margin === null ? "—" : pct(t.margin)}{warn ? " ⚠" : ""}</td>
      <td><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} aria-label="Live" /></td>
      <td className="nowrap">
        <button className="btn btn-small btn-ghost-dark" onClick={onPick}>Pool</button>{" "}
        {dirty && <button className="btn btn-small" onClick={() => onSave({ name, price, active: live })}>Save</button>}
      </td>
    </tr>
  );
}

function AddCard({ tier, onAdd }) {
  const blank = { name: "", set_name: "", grade: "", value: "", weight: "1", image: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const bind = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (file) setF({ ...f, image: await compress(file) });
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await onAdd(f);
    setF(blank);
    setBusy(false);
  }

  return (
    <form className="add-card" onSubmit={submit}>
      <input className="input" placeholder="Card name" required {...bind("name")} />
      <input className="input" placeholder="Set" {...bind("set_name")} />
      <input className="input" placeholder="Grade (PSA 9, Raw NM…)" {...bind("grade")} />
      <input className="input num" type="number" step="0.01" min="0" placeholder="Market value $" required {...bind("value")} />
      <input className="input num" type="number" step="0.1" min="0.1" placeholder="Weight" title="Relative chance. 1 = normal; 0.5 = half as likely as a normal card." {...bind("weight")} />
      <label className="btn btn-small btn-ghost-dark file-btn">{f.image ? "Photo ✓" : "Photo"}<input type="file" accept="image/*" onChange={onPhoto} hidden /></label>
      <button className="btn btn-small" disabled={busy}>{busy ? "Adding…" : `Add to ${tier.name}`}</button>
    </form>
  );
}

function CardRow({ c, total, onSave }) {
  const [value, setValue] = useState((c.market_value_cents / 100).toFixed(2));
  const [weight, setWeight] = useState(String(c.weight));
  const dirty = Math.round(value * 100) !== Number(c.market_value_cents) || Number(weight) !== Number(c.weight);
  const inPool = c.status === "available";
  return (
    <tr className={inPool ? "" : "row-dim"}>
      <td>{c.name}<div className="muted small">{c.set_name}</div></td>
      <td>{c.grade}</td>
      <td><input className="input input-sm num" type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} /></td>
      <td><input className="input input-sm num" type="number" step="0.1" min="0.1" value={weight} onChange={e => setWeight(e.target.value)} /></td>
      <td>{inPool && total ? pct(Number(c.weight) / total) : "—"}</td>
      <td>{{ available: "In pool", held: "In a vault", ship_requested: "To ship", shipped: "Shipped", retired: "Pulled from pool" }[c.status] || c.status}</td>
      <td className="nowrap">
        {dirty && <button className="btn btn-small" onClick={() => onSave({ value, weight })}>Save</button>}{" "}
        {c.status === "available" && <button className="link-button" onClick={() => onSave({ status: "retired" })}>Remove</button>}
        {c.status === "retired" && <button className="link-button" onClick={() => onSave({ status: "available" })}>Restore</button>}
      </td>
    </tr>
  );
}

function Shipment({ s, onShip }) {
  const [tracking, setTracking] = useState("");
  const a = s.address || {};
  return (
    <div className="ship-box">
      <div>
        <b>#{s.id}</b> · {new Date(s.created_at).toLocaleString()}
        <ul>{s.cards.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </div>
      <address>{a.name}<br />{a.line1}{a.line2 ? <>, {a.line2}</> : null}<br />{a.city}, {a.state} {a.zip}</address>
      <div className="ship-do">
        <input className="input input-sm" placeholder="Tracking #" value={tracking} onChange={e => setTracking(e.target.value)} />
        <button className="btn btn-small" onClick={() => onShip(tracking)}>Mark shipped</button>
      </div>
    </div>
  );
}
