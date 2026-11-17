import Link from "next/link";
import { useState } from "react";
import { money } from "../lib/shared";

export const MY_OFFERS = "bb-my-offers"; // this browser's offer links

// "Make an offer" on a product page. Sends the offer and shows the private status link.
export default function OfferForm({ product }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", amount: "", quantity: 1, message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const bind = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });
  const pct = f.amount ? Math.round((Number(f.amount) / product.price) * 100) : null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, itemId: product.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Couldn’t send your offer.");
      try {
        const list = JSON.parse(localStorage.getItem(MY_OFFERS) || "[]");
        localStorage.setItem(MY_OFFERS, JSON.stringify([{ id: d.id, name: product.name, at: Date.now() }, ...list].slice(0, 30)));
      } catch {}
      setSent(d.id);
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  if (sent) {
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/offer/${sent}`;
    return (
      <div className="offer-box sent">
        <b>Offer sent! 🐻</b>
        <p className="small">We’ll review it and reply by email{f.phone ? " or text" : ""}. Check its status any time here — bookmark this link:</p>
        <Link href={`/offer/${sent}`} className="offer-link">{link}</Link>
      </div>
    );
  }
  if (!open) return <button className="btn btn-ghost-dark offer-open" onClick={() => setOpen(true)}>Make an offer</button>;

  return (
    <form className="offer-box" onSubmit={submit}>
      <b>Make an offer</b>
      <div className="offer-row">
        <label className="field">Your offer (each)
          <span className="money-input">$<input className="input" type="number" min="0.01" step="0.01" required {...bind("amount")} /></span>
        </label>
        {product.stock > 1 && <label className="field">Qty<input className="input" type="number" min="1" max={product.stock} {...bind("quantity")} /></label>}
      </div>
      {pct !== null && pct > 0 && <p className="small muted">{pct}% of the {money(product.price)} list price</p>}
      <label className="field">Name<input className="input" required autoComplete="name" {...bind("name")} /></label>
      <label className="field">Email<input className="input" type="email" required autoComplete="email" {...bind("email")} /></label>
      <label className="field">Phone (optional, for a text back)<input className="input" type="tel" autoComplete="tel" {...bind("phone")} /></label>
      <label className="field">Message (optional)<textarea className="input" rows={2} maxLength={500} {...bind("message")} /></label>
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" {...bind("website")} />
      {error && <p className="error">{error}</p>}
      <button className="btn btn-block" disabled={busy}>{busy ? "Sending…" : "Send offer"}</button>
      <button type="button" className="link-button" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
