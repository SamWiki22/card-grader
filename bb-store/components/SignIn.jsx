import { useState } from "react";
import Modal from "./Modal";
import { useMe, postJSON } from "../lib/me";

// Two steps: email -> 6-digit code (+ 18+ confirmation).
export default function SignIn({ onClose, reason }) {
  const { refresh } = useMe();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [over18, setOver18] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await postJSON("/api/auth/send-code", { email }); setStep("code"); }
    catch (err) { setError(err.message); }
    setBusy(false);
  }
  async function verify(e) {
    e.preventDefault();
    if (!over18) return setError("Please confirm you’re 18 or older.");
    setBusy(true); setError("");
    try { await postJSON("/api/auth/verify", { email, code, over18 }); await refresh(); onClose(); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title="Sign in to Bearded Bear Packs" onClose={onClose}>
      {reason && <p className="muted small">{reason}</p>}
      {step === "email" ? (
        <form onSubmit={send} className="stack">
          <label className="field">Email
            <input className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </label>
          <button className="btn btn-block" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in code"}</button>
          <p className="muted small">No password needed. New here? This creates your account.</p>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <p className="small">We sent a code to <b>{email}</b>.</p>
          <label className="field">Sign-in code
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} autoFocus />
          </label>
          <label className="check">
            <input type="checkbox" checked={over18} onChange={e => setOver18(e.target.checked)} />
            <span>I’m 18 or older and agree to the pack <a href="/packs/rules" target="_blank" rel="noreferrer">rules &amp; odds</a>.</span>
          </label>
          <button className="btn btn-block" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="link-button" onClick={() => { setStep("email"); setCode(""); }}>Use a different email</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
