import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import Modal from "../components/Modal";
import SignIn from "../components/SignIn";
import AddFunds from "../components/AddFunds";
import { CardImage } from "../components/PackArt";
import { useMe, postJSON } from "../lib/me";
import { centsToMoney } from "../lib/shared";

const STATUS = { held: "In vault", ship_requested: "Shipping requested", shipped: "Shipped" };
const KIND = { deposit: "Added funds", pack_open: "Pack opened", buyback: "Sold back", shipping: "Shipping", adjustment: "Adjustment" };

export default function Vault() {
  const me = useMe();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [modal, setModal] = useState(null); // signin | funds | ship | {sell: card}
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

  async function sell(card) {
    setBusy(true); setError("");
    try {
      const r = await postJSON("/api/vault/sell", { card: card.id });
      me.setBalance(r.balance_cents);
      setMsg(`Sold ${card.name} for ${centsToMoney(r.amount_cents)}.`);
      setSelected(s => s.filter(x => x !== card.id));
      setModal(null);
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  if (!me.loading && !me.user) {
    return (
      <Layout title="Vault">
        <section className="wrap section empty">
          <img src="/logo.png" alt="" width="110" height="110" />
          <h1 className="page-title">Your vault</h1>
          <p>Every card you pull from a pack lands here. Sign in to see yours.</p>
          {me.ready && <div className="hero-ctas center"><button className="btn" onClick={() => setModal("signin")}>Sign in</button></div>}
        </section>
        {modal === "signin" && <SignIn onClose={() => setModal(null)} />}
      </Layout>
    );
  }

  return (
    <Layout title="Vault">
      <section className="wrap section">
        <div className="vault-head">
          <div>
            <h1 className="page-title">Your vault</h1>
            <p className="muted">{me.user?.email}</p>
          </div>
          <div className="vault-stats">
            <div><span className="muted small">Balance</span><b>{centsToMoney(me.balance_cents)}</b><button className="link-button" onClick={() => setModal("funds")}>Add funds</button></div>
            <div><span className="muted small">Vault value</span><b>{centsToMoney(vaultValue)}</b><span className="muted small">{held.length} card{held.length === 1 ? "" : "s"}</span></div>
          </div>
        </div>

        {msg && <p className="banner light">{msg}</p>}
        {error && <p className="error">{error}</p>}

        {!data ? <p className="muted">Loading…</p> : !held.length ? (
          <div className="empty">
            <p>No cards in your vault yet.</p>
            <div className="hero-ctas center"><Link href="/packs" className="btn">Open a pack</Link></div>
          </div>
        ) : (
          <>
            <div className="vault-actions">
              <span className="muted small">{selected.length ? `${selected.length} selected` : "Select cards to ship them to you"}</span>
              <button className="btn btn-small" disabled={!selected.length} onClick={() => setModal("ship")}>Ship selected</button>
            </div>
            <div className="grid">
              {held.map(c => (
                <article key={c.id} className={`card vault-card${selected.includes(c.id) ? " picked" : ""}`}>
                  <label className="vault-select"><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /> Ship</label>
                  <CardImage card={c} />
                  <div className="card-body">
                    <h3 className="card-title">{c.name}</h3>
                    {c.set_name && <p className="card-set">{c.set_name}</p>}
                  </div>
                  <div className="card-foot">
                    <div className="price">{centsToMoney(c.market_value_cents)}</div>
                    <button className="btn btn-small btn-ghost-dark" onClick={() => setModal({ sell: c })}>Sell back</button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {other.length > 0 && (
          <>
            <h2 className="sub-title">Shipping</h2>
            <ul className="list">
              {other.map(c => <li key={c.id}><span>{c.name}{c.grade ? ` · ${c.grade}` : ""}</span><span className="muted">{STATUS[c.status]}</span></li>)}
            </ul>
            {data.shipments.some(s => s.tracking) && (
              <ul className="list">
                {data.shipments.filter(s => s.tracking).map(s => <li key={s.id}><span>Shipment #{s.id}</span><span>Tracking: {s.tracking}</span></li>)}
              </ul>
            )}
          </>
        )}

        {data?.ledger.length > 0 && (
          <>
            <h2 className="sub-title">Activity</h2>
            <ul className="list">
              {data.ledger.map(l => (
                <li key={l.id}>
                  <span>{KIND[l.kind] || l.kind}<span className="muted small"> · {l.note} · {new Date(l.created_at).toLocaleDateString()}</span></span>
                  <b className={l.amount_cents >= 0 ? "pos" : "neg"}>{l.amount_cents >= 0 ? "+" : "−"}{centsToMoney(Math.abs(l.amount_cents))}</b>
                </li>
              ))}
            </ul>
          </>
        )}
        {me.user && <button className="link-button signout" onClick={me.signOut}>Sign out</button>}
      </section>

      {modal?.sell && (
        <Modal title="Sell this card back?" onClose={() => setModal(null)}>
          <p><b>{modal.sell.name}</b>{modal.sell.grade ? ` (${modal.sell.grade})` : ""}</p>
          <p>Market value {centsToMoney(modal.sell.market_value_cents)} → you get <b>{centsToMoney(Math.floor(modal.sell.market_value_cents * data.buyback_percent / 100))}</b> ({data.buyback_percent}%) added to your balance right away.</p>
          <button className="btn btn-block" disabled={busy} onClick={() => sell(modal.sell)}>{busy ? "Selling…" : "Sell back"}</button>
        </Modal>
      )}
      {modal === "ship" && <ShipForm cards={held.filter(c => selected.includes(c.id))} fee={data.ship_fee_cents} onClose={() => setModal(null)}
        onDone={async n => { setModal(null); setSelected([]); setMsg(`Shipping requested for ${n} card${n === 1 ? "" : "s"}. We’ll email you tracking.`); await load(); me.refresh(); }} />}
      {modal === "funds" && <AddFunds onClose={() => setModal(null)} />}
    </Layout>
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
