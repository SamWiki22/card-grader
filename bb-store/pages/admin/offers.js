import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import SignIn from "../../components/SignIn";
import { AdminGate } from "../../components/TeamLogin";
import { useMe, postJSON } from "../../lib/me";
import { money } from "../../lib/shared";

const LABEL = { pending: "New", countered: "Countered — waiting on customer", accepted: "Accepted — waiting for purchase", declined: "Declined", expired: "Expired", purchased: "Purchased" };

// Staff + admins: customer offers on store items.
export default function Offers() {
  const me = useMe();
  const [offers, setOffers] = useState(null);
  const [denied, setDenied] = useState("");
  const [msg, setMsg] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/offers");
    const d = await r.json();
    if (!r.ok) return setDenied(d.error || "Not allowed");
    setOffers(d.offers);
  }, []);
  useEffect(() => { if (me.user || me.team) load(); }, [me.user, me.team, load]);

  async function act(body, ok) {
    setMsg("");
    try { await postJSON("/api/admin/offers", body); await load(); setMsg(ok); }
    catch (e) { setMsg(`Error: ${e.message}`); }
  }

  if (!me.loading && !me.user && !me.team) return <Layout title="Offers"><AdminGate /></Layout>;
  if (denied) return <Layout title="Offers"><section className="wrap section"><p className="error">{denied}</p></section></Layout>;
  if (!offers) return <Layout title="Offers"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  const open = offers.filter(o => ["pending", "countered", "accepted"].includes(o.status));
  const closed = offers.filter(o => !open.includes(o));

  return (
    <Layout title="Offers">
      <section className="wrap section admin">
        <div className="admin-head">
          <h1 className="page-title">Offers</h1>
          <span className="admin-links"><Link href="/admin/store" className="btn btn-small btn-ghost-dark">← Inventory</Link></span>
        </div>
        <p className="muted small">Customers make offers from any product page. Accepted and countered offers hold the price for 48 hours. Reply by email or text using the links on each offer — the customer can also check their offer link.</p>
        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}
        {!open.length && <p className="muted">No open offers right now.</p>}
        <div className="offer-list">{open.map(o => <OfferRow key={o.id} o={o} act={act} />)}</div>
        {closed.length > 0 && (
          <>
            <button className="link-button" onClick={() => setShowClosed(!showClosed)}>{showClosed ? "Hide" : "Show"} closed offers ({closed.length}, last 30 days)</button>
            {showClosed && <div className="offer-list">{closed.map(o => <OfferRow key={o.id} o={o} act={act} />)}</div>}
          </>
        )}
      </section>
    </Layout>
  );
}

function OfferRow({ o, act }) {
  const [counter, setCounter] = useState("");
  const [note, setNote] = useState(o.admin_note || "");
  const amount = Number(o.amount_cents) / 100;
  const pct = Math.round((amount / Number(o.current_price || o.list_price)) * 100);
  const isOpen = ["pending", "countered", "accepted"].includes(o.status);
  const link = typeof window !== "undefined" ? `${window.location.origin}/offer/${o.id}` : `/offer/${o.id}`;
  const reply = (text) => `mailto:${o.email}?subject=${encodeURIComponent(`Your offer on ${o.item_name}`)}&body=${encodeURIComponent(`Hi ${o.name},\n\n${text}\n\nYour offer page: ${link}\n\n— Bearded Bear TCG`)}`;

  return (
    <article className={`offer-row-card s-${o.status}`}>
      <div className="offer-main">
        <Link href={`/product/${encodeURIComponent(o.item_id)}`} className="offer-item" target="_blank">{o.item_name}</Link>
        <div className="offer-figs">
          <b>{money(amount)}</b>{o.quantity > 1 && <> × {o.quantity}</>}
          <span className={`pct ${pct >= 85 ? "good" : pct >= 70 ? "ok" : "low"}`}>{pct}% of {money(o.current_price || o.list_price)}</span>
          {o.counter_cents != null && <span className="small">· countered {money(o.counter_cents / 100)}</span>}
        </div>
        <div className="small">{o.name} · <a href={reply("")}>{o.email}</a>{o.phone && <> · <a href={`sms:${o.phone}`}>text {o.phone}</a></>} · {new Date(o.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        {o.message && <div className="small muted">“{o.message}”</div>}
        <div className="small"><span className="pill-status">{LABEL[o.status] || o.status}</span>{o.in_stock <= 0 && isOpen && <span className="error"> · out of stock now</span>}</div>
      </div>
      {isOpen && (
        <div className="offer-do">
          <input className="input input-sm" placeholder="Note to customer (optional)" value={note} onChange={e => setNote(e.target.value)} />
          {o.status !== "accepted" && <button className="btn btn-small" onClick={() => act({ action: "accept", id: o.id, note }, `Accepted ${o.name}’s offer — let them know with the email link.`)}>Accept {money(amount)}</button>}
          <div className="offer-counter">
            <span className="money-input">$<input className="input input-sm num" type="number" step="0.01" min="0" placeholder="Counter" value={counter} onChange={e => setCounter(e.target.value)} /></span>
            <button className="btn btn-small btn-ghost-dark" disabled={!counter} onClick={() => act({ action: "counter", id: o.id, amount: counter, note }, `Countered at ${money(counter)}.`)}>Counter</button>
          </div>
          <div className="offer-quick">
            <a className="link-button" href={reply(o.status === "pending" ? "Thanks for your offer! We've responded — check your offer page:" : "Update on your offer — see your offer page:")}>Email them</a>
            {o.phone && <a className="link-button" href={`sms:${o.phone}?&body=${encodeURIComponent(`Bearded Bear TCG: update on your offer for ${o.item_name} — ${link}`)}`}>Text them</a>}
            <button className="link-button" onClick={() => act({ action: "decline", id: o.id, note }, "Offer declined.")}>Decline</button>
          </div>
        </div>
      )}
    </article>
  );
}
