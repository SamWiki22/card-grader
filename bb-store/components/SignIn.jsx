import { useState } from "react";
import Modal from "./Modal";
import { useMe, postJSON } from "../lib/me";

// Step 1: email + 18+ box → we email a sign-in link.
// Step 2: tap the link in the email (or, if the email shows a 6-digit code, type it here).
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
    if (!over18) return setError("Please confirm you’re 18 or older.");
    setBusy(true); setError("");
    try {
      try { localStorage.setItem("bb-after-signin", window.location.pathname); } catch {}
      await postJSON("/api/auth/send-code", { email, over18 });
      setStep("sent");
    } catch (err) { setError(err.message); }
    setBusy(false);
  }
  async function verify(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await postJSON("/api/auth/verify", { email, code, over18: true }); await refresh(); onClose(); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <Modal title="Sign in to Bearded Bear" onClose={onClose}>
      {reason && step === "email" && <p className="muted small">{reason}</p>}
      {step === "email" ? (
        <form onSubmit={send} className="stack">
          <label className="field">Email
            <input className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </label>
          <label className="check">
            <input type="checkbox" checked={over18} onChange={e => setOver18(e.target.checked)} />
            <span>I’m 18 or older and agree to the pack <a href="/packs/rules" target="_blank" rel="noreferrer">rules &amp; odds</a>.</span>
          </label>
          <button className="btn btn-block" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          <p className="muted small">No password needed. New here? This creates your account.</p>
        </form>
      ) : (
        <div className="stack">
          <p>We sent an email to <b>{email}</b>. Open it <b>on this device</b> and tap <b>Sign in</b> — you’ll come right back here, signed in.</p>
          <p className="muted small">Nothing yet? Check spam, and give it a minute. If the email shows a 6-digit code instead, enter it:</p>
          <form onSubmit={verify} className="stack">
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />
            <button className="btn btn-block" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Sign in with code"}</button>
          </form>
          <button type="button" className="link-button" onClick={() => { setStep("email"); setCode(""); setError(""); }}>Use a different email</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
