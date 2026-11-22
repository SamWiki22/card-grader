import { useState } from "react";
import Modal from "./Modal";
import { postJSON } from "../lib/me";
import { shrink } from "../lib/photo";
import { centsToMoney } from "../lib/shared";

// Walk through a pool's cards that have no photo, priciest first: take a photo,
// it saves, the next card comes up. Built for doing a stack of cards on a phone.
export default function PhotoPass({ tier, cards, onDone }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState([]); // [{ name, photo }]
  const [error, setError] = useState("");
  const missing = cards.filter(c => !c.has_photo && !["shipped", "retired"].includes(c.status));

  function start() {
    setList([...missing].sort((a, b) => b.market_value_cents - a.market_value_cents));
    setI(0); setSaved([]); setError(""); setOpen(true);
  }
  function close() {
    setOpen(false);
    if (saved.length) onDone(`Saved ${saved.length} photo${saved.length === 1 ? "" : "s"} for ${tier.name}.`);
  }
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    const card = list[i];
    setBusy(true); setError("");
    try {
      const photo = await shrink(file, 900);
      await postJSON("/api/admin/packs", { action: "set-card-photo", id: card.id, image: photo });
      setSaved(s => [{ name: card.name, photo }, ...s]);
      setI(n => n + 1);
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  const card = list[i];
  return (
    <>
      <button className="btn btn-small btn-ghost-dark" onClick={start} disabled={!missing.length}>
        📷 {missing.length ? `Photo pass (${missing.length} need a photo)` : "Every card has a photo"}
      </button>
      {open && (
        <Modal title={`Photo pass · ${tier.name}`} onClose={close}>
          {card ? (
            <div className="pass">
              <p className="muted small">Card {i + 1} of {list.length}. Find this card, then take its photo.</p>
              <div className="pass-card">
                <b>{card.name}</b>
                <span className="muted">{[card.set_name, card.grade].filter(Boolean).join(" · ")}</span>
                <span className="pass-value">{centsToMoney(card.market_value_cents)}</span>
              </div>
              <label className={`btn pass-shoot${busy ? " disabled" : ""}`}>
                {busy ? "Saving…" : "📷 Take photo"}
                <input type="file" accept="image/*" onChange={onFile} hidden disabled={busy} />
              </label>
              <div className="pass-row">
                <label className="btn btn-small btn-ghost-dark">🖼 From library<input type="file" accept="image/*" onChange={onFile} hidden disabled={busy} /></label>
                <button className="btn btn-small btn-ghost-dark" onClick={() => setI(n => n + 1)} disabled={busy}>Skip</button>
              </div>
              {error && <p className="error small">{error}</p>}
            </div>
          ) : (
            <div className="pass">
              <p><b>Done.</b> {saved.length} photo{saved.length === 1 ? "" : "s"} saved{list.length - saved.length ? `, ${list.length - saved.length} skipped` : ""}.</p>
              <button className="btn" onClick={close}>Close</button>
            </div>
          )}
          {saved.length > 0 && (
            <div className="pass-saved">
              {saved.slice(0, 6).map((s, k) => <img key={k} src={s.photo} alt={s.name} title={s.name} />)}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
