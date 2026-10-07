import { useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import { useCart } from "../lib/cart";
import { money } from "../lib/pricing";

export default function Cart() {
  const { items, setQty, clear, total } = useCart();
  const [form, setForm] = useState({ email: "", name: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState(null);

  const checkout = async e => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, items: items.map(i => ({ kind: i.kind, id: i.id, quantity: i.quantity })) }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Checkout failed");
      if (body.url) {
        window.location.href = body.url;
        return;
      }
      clear();
      setPlaced(body.orderId);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  if (placed) {
    return (
      <Layout title="Order placed">
        <div className="card">
          <h1>Order received</h1>
          <p>Thanks! Your order number is <code>{placed.slice(0, 8)}</code>. We&apos;ll email <strong>{form.email}</strong> with payment and pickup/shipping details.</p>
          <Link href="/" className="btn">Keep shopping</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Cart">
      <h1>Cart</h1>
      {items.length === 0 ? (
        <p className="muted">Your cart is empty. <Link href="/decks">Browse decks</Link> or <Link href="/singles">singles</Link>.</p>
      ) : (
        <div className="stack">
          <div className="card scroll-x">
            <table>
              <thead><tr><th>Item</th><th>Price</th><th style={{ width: 90 }}>Qty</th><th>Subtotal</th><th /></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={`${i.kind}-${i.id}`}>
                    <td><strong>{i.name}</strong><div className="small muted">{i.detail || (i.kind === "deck" ? "Pre-built deck" : "Single")}</div></td>
                    <td>{money(i.price)}</td>
                    <td><input type="number" min={1} max={i.max || 99} value={i.quantity}
                      onChange={e => setQty(i.kind, i.id, Math.max(1, Math.min(i.max || 99, parseInt(e.target.value, 10) || 1)))} /></td>
                    <td>{money(i.price * i.quantity)}</td>
                    <td><button className="btn small danger" onClick={() => setQty(i.kind, i.id, 0)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="spread" style={{ marginTop: 12 }}><span className="muted">Final prices are confirmed at checkout.</span><span className="price">Total {money(total)}</span></div>
          </div>
          <form className="card stack" onSubmit={checkout} style={{ maxWidth: 520 }}>
            <h2>Checkout</h2>
            <div><label>Email *</label><input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><label>Notes (sleeve color, pickup time…)</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
            {error && <div className="error">{error}</div>}
            <button className="btn primary" disabled={busy}>{busy ? "Working…" : "Place order"}</button>
          </form>
        </div>
      )}
    </Layout>
  );
}
