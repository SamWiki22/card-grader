import Link from "next/link";
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProductImage from "../components/ProductImage";
import { useCart } from "../lib/cart";
import { shopInfo } from "../lib/catalog";
import { money, GAME_LABEL } from "../lib/shared";
import { shippingPlan } from "../lib/shipping";
import { useMe } from "../lib/me";

export default function Cart({ info }) {
  const { lines, ready, setQty, remove, replace, subtotal, count } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  // Signed-in pack players can add the cards in their vault to this package.
  const me = useMe();
  const [vault, setVault] = useState([]);
  const [withVault, setWithVault] = useState(false);
  useEffect(() => {
    if (!me?.user) return;
    fetch("/api/vault").then(r => r.ok ? r.json() : null).then(d => setVault((d?.cards || []).filter(c => c.status === "held"))).catch(() => {});
  }, [me?.user]);
  const vaultCards = withVault ? vault.length : 0;

  // Refresh prices/stock from the live inventory whenever the cart opens.
  useEffect(() => {
    if (!ready || !lines.length) return;
    fetch("/api/cart-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: lines.map(l => l.id) }) })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const live = Object.fromEntries(data.products.map(p => [p.id, p]));
        const changes = [];
        const next = lines.flatMap(l => {
          const p = live[l.id];
          if (!p || p.stock <= 0 || p.price <= 0) { changes.push(`${l.name} sold out and was removed.`); return []; }
          const qty = Math.min(l.qty, p.stock);
          if (qty < l.qty) changes.push(`Only ${p.stock} of ${l.name} left — quantity updated.`);
          if (p.price !== l.price) changes.push(`${l.name} is now ${money(p.price)}.`);
          return [{ ...l, price: p.price, stock: p.stock, name: p.name, set: p.set, type: p.type || l.type, qty }];
        });
        if (changes.length) { replace(next); setNote(changes.join(" ")); }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function checkout() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: lines.map(l => ({ id: l.id, qty: l.qty })), vault: withVault }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (e) {
      setError(e.message); setBusy(false);
    }
  }

  const orderEmail = info.contactEmail && `mailto:${info.contactEmail}?subject=${encodeURIComponent("Order request — Bearded Bear TCG")}&body=${encodeURIComponent(
    "Hi! I'd like to order:\n\n" + lines.map(l => `${l.qty} × ${l.name}${l.set ? ` (${l.set})` : ""}${l.condition ? ` [${l.condition}]` : ""} — ${money(l.price)} each`).join("\n") + `\n\nSubtotal: ${money(subtotal)}\n\nName:\nShipping address or local pickup:\n`
  )}`;

  return (
    <Layout title="Cart">
      <section className="wrap section cart-page">
        <h1 className="page-title">Your cart</h1>
        {!ready ? null : !lines.length ? (
          <div className="empty">
            <img src="/logo.png" alt="" width="96" height="96" />
            <p>Your cart is empty.</p>
            <div className="hero-ctas center">
              <Link href="/shop?category=singles" className="btn">Shop singles</Link>
              <Link href="/shop?category=sealed" className="btn btn-ghost-dark">Shop sealed</Link>
            </div>
          </div>
        ) : (
          <div className="cart-layout">
            <div>
              {note && <p className="notice">{note}</p>}
              <ul className="cart-lines">
                {lines.map(l => (
                  <li key={l.id} className="cart-line">
                    <Link href={`/product/${encodeURIComponent(l.id)}`}><ProductImage product={l} className="thumb" /></Link>
                    <div className="cart-line-info">
                      <Link href={`/product/${encodeURIComponent(l.id)}`} className="cart-line-name">{l.name}</Link>
                      <div className="muted small">{[l.set, l.condition].filter(Boolean).join(" · ")}</div>
                      <div className="cart-line-controls">
                        <div className="qty qty-small">
                          <button onClick={() => setQty(l.id, l.qty - 1)} aria-label={`Decrease ${l.name}`}>−</button>
                          <span>{l.qty}</span>
                          <button onClick={() => setQty(l.id, l.qty + 1)} disabled={l.qty >= l.stock} aria-label={`Increase ${l.name}`}>+</button>
                        </div>
                        <button className="link-button" onClick={() => remove(l.id)}>Remove</button>
                      </div>
                    </div>
                    <div className="cart-line-price">{money(l.price * l.qty)}</div>
                  </li>
                ))}
              </ul>
            </div>
            <aside className="summary">
              <div className="summary-row"><span>Items</span><span>{count}</span></div>
              <div className="summary-row total"><span>Subtotal</span><span>{money(subtotal)}</span></div>
              {vault.length > 0 && (
                <label className="vault-addon small">
                  <input type="checkbox" checked={withVault} onChange={e => setWithVault(e.target.checked)} />
                  <span>Ship my <b>{vault.length} vault card{vault.length === 1 ? "" : "s"}</b> in this package — no extra shipping.</span>
                </label>
              )}
              <ShippingNote plan={shippingPlan(lines.map(l => ({ type: l.type, priceCents: Math.round(l.price * 100), qty: l.qty })), info.shipping, { vaultCards })} cfg={info.shipping} />
              {info.checkoutEnabled ? (
                <button className="btn btn-block" onClick={checkout} disabled={busy}>{busy ? "Starting checkout…" : "Checkout"}</button>
              ) : orderEmail ? (
                <>
                  <a className="btn btn-block" href={orderEmail}>Send order request</a>
                  <p className="muted small">We’ll email you to confirm and arrange payment.</p>
                </>
              ) : (
                <p className="notice">Online checkout is coming soon — message us to buy!</p>
              )}
              {info.instagramUrl && <a className="muted small block" href={info.instagramUrl} target="_blank" rel="noreferrer">Questions? DM us on Instagram</a>}
              {error && <p className="error">{error}</p>}
            </aside>
          </div>
        )}
      </section>
    </Layout>
  );
}

export async function getServerSideProps() {
  return { props: { info: shopInfo() } };
}

// Tells the shopper up front how their order can ship (rules in lib/shipping.js).
function ShippingNote({ plan, cfg }) {
  const m = c => money(c / 100);
  return (
    <div className="ship-note small">
      {plan.shortCents > 0 ? (
        <p className="ship-warn">
          Bulk cards (singles under {m(cfg.bulkMaxCents)}) need a {m(cfg.minOrderCents)} order to ship. Add <b>{m(plan.shortCents)}</b> more
          {cfg.pickup ? <>, or pick it up free at <b>{cfg.pickupName}</b> ({cfg.pickupAddress}).</> : "."}
        </p>
      ) : plan.free ? (
        <p>You’ve got <b>free tracked shipping</b>!</p>
      ) : (
        <p>
          {plan.options.filter(o => o.id !== "pickup").map(o => o.name + " " + m(o.cents)).join(" · ")}
          {cfg.freeMinCents > 0 && <> · Free over {m(cfg.freeMinCents)}</>}
        </p>
      )}
      {cfg.pickup && plan.shortCents === 0 && <p className="muted">Or pick up free at {cfg.pickupName} · {cfg.pickupAddress}</p>}
    </div>
  );
}
