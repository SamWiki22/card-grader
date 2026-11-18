import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import Modal from "../components/Modal";
import SignIn from "../components/SignIn";
import { CardImage } from "../components/PackArt";
import { useMe, postJSON } from "../lib/me";
import { centsToMoney, valueBasis } from "../lib/shared";

const STATUS = { ship_requested: "Shipping requested", shipped: "Shipped" };

export default function Vault() {
  const me = useMe();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null); // signin | ship | {sell: card}
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/vault");
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => { if (me.user) load(); }, [me.user, load]);

  const held = data?.cards.filter(c => c.status === "held") || [];
  const other = data?.cards.filter(c => c.status !== "held") || [];
  const vaultValue = held.reduce((s, c) => s + c.market_value_cents, 0);
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  async function sell(card, to) {
    setBusy(true); setError("");
    try {
      const r = await postJSON("/api/vault/sell", { card: card.id, to });
      me.setBalance(r.balance_cents);
      setMsg(`Sold ${card.name} ${to === "store" ? "to Bearded Bear" : "into a pack pool"} for ${centsToMoney(r.amount_cents)}.`);
      setSelected(s => s.filter(x => x !== card.id));
      setModal(null);
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  if (!me.loading && !me.user) {
    return (
      <AppShell title="Vault">
        <div className="app-empty">
          <img src="/logo.png" alt="" width="110" height="110" />
          <h1>Your vault</h1>
          <p>Every card you pull from a pack lands here.</p>
          {me.ready && <button className="buy-btn narrow" onClick={() => setModal("signin")}><span>Sign in</span></button>}
        </div>
        {modal === "signin" && <SignIn onClose={() => setModal(null)} />}
      </AppShell>
    );
  }

  const bar = held.length > 0 && (
    <div className="buy-bar">
      <div className="buy-bar-inner">
        <div className="buy-bar-top">
          <span className="caps">{selected.length ? `${selected.length} selected` : "Tap cards to ship them home"}</span>
          {selected.length > 0 && <button className="add-link" onClick={() => setSelected([])}>Clear</button>}
        </div>
        <button className="buy-btn" disabled={!selected.length} onClick={() => setModal("ship")}>
          <span>{selected.length ? `Ship ${selected.length} card${selected.length === 1 ? "" : "s"}` : "Select cards to ship"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <AppShell title="Vault" bar={bar}>
      <div className="app-head">
        <h1>Vault</h1>
        <div className="stat-row">
          <div className="stat"><span className="caps">Vault value</span><b>{centsToMoney(vaultValue)}</b></div>
          <div className="stat"><span className="caps">Cards</span><b>{held.length}</b></div>
          <div className="stat"><span className="caps">Balance</span><b>{centsToMoney(me.balance_cents)}</b></div>
        </div>
      </div>

      {msg && <p className="app-banner">{msg}</p>}
      {error && <p className="buy-error">{error}</p>}

      {!data ? <p className="dim">Loading…</p> : !held.length ? (
        <div className="app-empty small-empty">
          <p>No cards in your vault yet.</p>
          <Link href="/packs" className="buy-btn narrow"><span>Open a pack</span></Link>
        </div>
      ) : (
        <div className="vault-grid">
          {held.map(c => {
            const on = selected.includes(c.id);
            return (
              <div key={c.id} className={`vault-item${on ? " on" : ""}`}>
                <button className="vault-pick" onClick={() => toggle(c.id)} aria-pressed={on} aria-label={`Select ${c.name} for shipping`}>
                  <CardImage card={c} />
                  {on && <span className="vault-check">✓</span>}
                </button>
                <div className="in-pack-name">{c.name}</div>
                <div className="vault-row">
                  <span className="in-pack-value">{centsToMoney(c.market_value_cents)}</span>
                  <button className="mini-pill" onClick={() => setModal({ sell: c })}>Sell</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {other.length > 0 && (
        <section className="app-section">
          <h2>On the way</h2>
          <ul className="app-list">
            {other.map(c => <li key={c.id}><span>{c.name}{c.grade ? ` · ${c.grade}` : ""}</span><span className="dim">{STATUS[c.status]}</span></li>)}
            {data.shipments.filter(s => s.tracking).map(s => <li key={`s${s.id}`}><span>Shipment #{s.id}</span><span className="dim">Tracking {s.tracking}</span></li>)}
          </ul>
        </section>
      )}

      {modal?.sell && (
        <Modal title="Sell this card?" onClose={() => setModal(null)}>
          <p><b>{modal.sell.name}</b>{modal.sell.grade ? ` (${modal.sell.grade})` : ""}</p>
          <p>Market value {centsToMoney(modal.sell.market_value_cents)} → you get <b>{centsToMoney(modal.sell.buyback_cents)}</b> ({modal.sell.buyback_percent}%) added to your balance right away.</p>
          <p className="muted small">Value based on: {modal.sell.price_source === "comp" && modal.sell.comp_url ? <a href={modal.sell.comp_url} target="_blank" rel="noreferrer">{valueBasis(modal.sell)}</a> : valueBasis(modal.sell)}</p>
          <div className="stack">
            <button className="btn btn-block" disabled={busy} onClick={() => sell(modal.sell, "pool")}>{busy ? "Selling…" : "Sell into a pack pool"}</button>
            <span className="muted small">It goes into a pack for someone else to pull.</span>
            <button className="btn btn-block btn-ghost-dark" disabled={busy} onClick={() => sell(modal.sell, "store")}>{busy ? "Selling…" : "Sell to Bearded Bear"}</button>
            <span className="muted small">We buy it for the shop. Same price either way.</span>
          </div>
        </Modal>
      )}
      {modal === "ship" && <ShipForm cards={held.filter(c => selected.includes(c.id))} fee={data.ship_fee_cents} onClose={() => setModal(null)}
        onDone={async n => { setModal(null); setSelected([]); setMsg(`Shipping requested for ${n} card${n === 1 ? "" : "s"}. We’ll email you tracking.`); await load(); me.refresh(); }} />}
    </AppShell>
  );
}

function ShipForm({ cards, fee, onClose, onDone }) {
  const [a, setA] = useState({ name: "", line1: "", line2: "", city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const f = k => ({ value: a[k], onChange: e => setA({ ...a, [k]: e.target.value }) });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await postJSON("/api/vault/ship", { cards: cards.map(c => c.id), address: a }); onDone(cards.length); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title={`Ship ${cards.length} card${cards.length === 1 ? "" : "s"}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">Full name<input className="input" required autoComplete="name" {...f("name")} /></label>
        <label className="field">Address<input className="input" required autoComplete="address-line1" {...f("line1")} /></label>
        <label className="field">Apt, suite (optional)<input className="input" autoComplete="address-line2" {...f("line2")} /></label>
        <div className="row3">
          <label className="field">City<input className="input" required autoComplete="address-level2" {...f("city")} /></label>
          <label className="field">State<input className="input" required autoComplete="address-level1" maxLength={2} {...f("state")} /></label>
          <label className="field">ZIP<input className="input" required autoComplete="postal-code" {...f("zip")} /></label>
        </div>
        <p className="muted small">{fee ? `Shipping is ${centsToMoney(fee)}, taken from your balance.` : "Shipping is free."} US addresses only.</p>
        <button className="btn btn-block" disabled={busy}>{busy ? "Requesting…" : "Request shipping"}</button>
        {error && <p className="error">{error}</p>}
      </form>
    </Modal>
  );
}
