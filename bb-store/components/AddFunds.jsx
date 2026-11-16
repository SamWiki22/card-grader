import { useState } from "react";
import Modal from "./Modal";
import { postJSON } from "../lib/me";
import { TOPUP_AMOUNTS, centsToMoney } from "../lib/shared";

export default function AddFunds({ onClose, shortCents = 0 }) {
  const suggested = TOPUP_AMOUNTS.find(a => a * 100 >= shortCents) || TOPUP_AMOUNTS[TOPUP_AMOUNTS.length - 1];
  const [amount, setAmount] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true); setError("");
    try { const { url } = await postJSON("/api/wallet/topup", { amount }); window.location.href = url; }
    catch (e) { setError(e.message); setBusy(false); }
  }

  return (
    <Modal title="Add funds" onClose={onClose}>
      {shortCents > 0 && <p className="muted small">You’re {centsToMoney(shortCents)} short for this pack.</p>}
      <div className="amount-grid">
        {TOPUP_AMOUNTS.map(a => (
          <button key={a} className={`amount${a === amount ? " selected" : ""}`} onClick={() => setAmount(a)}>${a}</button>
        ))}
      </div>
      <button className="btn btn-block" onClick={go} disabled={busy}>{busy ? "Opening checkout…" : `Add $${amount} with card`}</button>
      <p className="muted small">Funds are pack credit for Bearded Bear Packs and aren’t a bank balance.</p>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
