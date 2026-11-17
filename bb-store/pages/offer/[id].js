import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { money } from "../../lib/shared";

const STATUS = {
  pending: "Waiting for Bearded Bear to review",
  accepted: "Accepted! 🎉",
  countered: "We sent a counter-offer",
  declined: "Declined",
  expired: "Expired",
  purchased: "Purchased — thank you!",
};

// The customer's private offer page (the link is the key — no account needed).
export default function OfferPage() {
  const { query } = useRouter();
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!query.id) return;
    const r = await fetch(`/api/offers/${encodeURIComponent(query.id)}`);
    const j = await r.json();
    if (!r.ok) return setError(j.error || "Offer not found.");
    setD(j);
  }, [query.id]);
  useEffect(() => { load(); }, [load]);

  async function act(action) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/offers/${encodeURIComponent(query.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }
  async function buy() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offer: query.id }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      window.location.href = j.url;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  if (error && !d) return <Layout title="Your offer"><section className="wrap section empty"><h1 className="page-title">Offer not found</h1><p>{error}</p></section></Layout>;
  if (!d) return <Layout title="Your offer"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  const o = d.offer;
  const agreed = o.counter_cents ?? o.amount_cents;
  const expires = o.expires_at ? new Date(o.expires_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
  const mail = d.contactEmail && `mailto:${d.contactEmail}?subject=${encodeURIComponent(`My accepted offer — ${o.item_name}`)}&body=${encodeURIComponent(`Hi! My offer was accepted:\n${o.quantity} × ${o.item_name} at ${money(agreed / 100)} each.\nOffer link: ${typeof window !== "undefined" ? window.location.href : ""}\n\nShipping address or local pickup:\n`)}`;

  return (
    <Layout title="Your offer">
      <section className="wrap section offer-page">
        <h1 className="page-title">Your offer</h1>
        <div className={`offer-card s-${o.status}`}>
          <Link href={`/product/${encodeURIComponent(o.item_id)}`} className="offer-item">{o.item_name}</Link>
          <div className="offer-nums">
            <div><span className="muted small">Listed at</span><b>{money(o.list_price)}</b></div>
            <div><span className="muted small">You offered</span><b>{money(o.amount_cents / 100)}</b>{o.quantity > 1 && <span className="small muted"> × {o.quantity}</span>}</div>
            {o.counter_cents != null && <div><span className="muted small">Our counter</span><b>{money(o.counter_cents / 100)}</b></div>}
          </div>
          <p className="offer-status">{STATUS[o.status] || o.status}</p>
          {o.admin_note && <p className="small">“{o.admin_note}”</p>}

          {o.status === "countered" && (
            <div className="offer-actions">
              <button className="btn" disabled={busy} onClick={() => act("accept-counter")}>Accept {money(o.counter_cents / 100)}</button>
              <button className="btn btn-ghost-dark" disabled={busy} onClick={() => act("decline-counter")}>No thanks</button>
              {expires && <p className="small muted">Counter good until {expires}.</p>}
            </div>
          )}
          {o.status === "accepted" && (
            <div className="offer-actions">
              {d.checkout
                ? <button className="btn" disabled={busy} onClick={buy}>Buy now at {money(agreed / 100)}{o.quantity > 1 ? ` × ${o.quantity}` : ""}</button>
                : mail ? <a className="btn" href={mail}>Email us to complete your purchase</a> : <p>We’ll contact you to complete your purchase.</p>}
              {expires && <p className="small muted">Your price is held until {expires}.</p>}
            </div>
          )}
          {o.status === "pending" && <button className="link-button" disabled={busy} onClick={() => act("withdraw")}>Withdraw my offer</button>}
          {error && <p className="error">{error}</p>}
        </div>
        <p className="muted small">Keep this page’s link — it’s how you check and accept your offer.</p>
      </section>
    </Layout>
  );
}
