import { useState } from "react";
import Modal from "./Modal";
import { useMe, postJSON } from "../lib/me";

// Shopper sign-in.
//  • Log in: email + password.
//  • Create account: email + password + 18+ → we email a 6-digit code once to
//    prove the email is theirs → account made, signed in. Password from then on.
//  • Forgot password: email code + a new password.
//  • Or skip passwords: email me a sign-in link (the old way, still works).
export default function SignIn({ onClose, reason, startMode = "login" }) {
  const { refresh } = useMe();
  const [mode, setMode] = useState(startMode); // login | signup | reset | link
  const [step, setStep] = useState("form");    // form | code
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [over18, setOver18] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = m => { setMode(m); setStep("form"); setCode(""); setError(""); };
  const needsCode = mode === "signup" || mode === "reset" || mode === "link";

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (mode !== "login" && mode !== "reset" && !over18) return setError("Please confirm you’re 18 or older.");
    if ((mode === "signup" || mode === "reset") && password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    try {
      if (mode === "login") {
        await postJSON("/api/auth/login", { email, password });
        await refresh(); onClose();
        return;
      }
      try { localStorage.setItem("bb-after-signin", window.location.pathname); } catch {}
      await postJSON("/api/auth/send-code", { email, over18, purpose: mode === "reset" ? "reset" : undefined });
      setStep("code");
    } catch (err) { setError(err.message); }
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await postJSON("/api/auth/verify", { email, code, over18: mode !== "reset" ? true : undefined, purpose: mode === "reset" ? "reset" : undefined, password: mode === "link" ? undefined : password });
      await refresh(); onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const title = { login: "Log in", signup: "Create your account", reset: "Reset your password", link: "Sign in with an email link" }[mode];

  return (
    <Modal title={title} onClose={onClose}>
      {reason && step === "form" && <p className="muted small">{reason}</p>}
      {step === "form" ? (
        <form onSubmit={submit} className="stack">
          {(mode === "login" || mode === "signup") && (
            <div className="auth-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "on" : ""} onClick={() => go("login")}>Log in</button>
              <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "on" : ""} onClick={() => go("signup")}>Create account</button>
            </div>
          )}
          <label className="field">Email
            <input className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </label>
          {mode !== "link" && (
            <label className="field">{mode === "reset" ? "New password" : "Password"}
              <span className="pw-row">
                <input className="input" type={show ? "text" : "password"} required minLength={mode === "login" ? 1 : 8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" className="link-button small" onClick={() => setShow(s => !s)}>{show ? "Hide" : "Show"}</button>
              </span>
              {mode !== "login" && <span className="muted small">At least 8 characters.</span>}
            </label>
          )}
          {(mode === "signup" || mode === "link") && (
            <label className="check">
              <input type="checkbox" checked={over18} onChange={e => setOver18(e.target.checked)} />
              <span>I’m 18 or older and agree to the pack <a href="/packs/rules" target="_blank" rel="noreferrer">rules &amp; odds</a>.</span>
            </label>
          )}
          <button className="btn btn-block" disabled={busy}>
            {busy ? "One moment…" : { login: "Log in", signup: "Create account", reset: "Email me a code", link: "Email me a sign-in link" }[mode]}
          </button>
          <div className="auth-links small">
            {mode === "login" && <button type="button" className="link-button" onClick={() => go("reset")}>Forgot password?</button>}
            {mode === "signup" && <span className="muted">We’ll email you a code once to confirm it’s your email.</span>}
            {(mode === "reset" || mode === "link") && <button type="button" className="link-button" onClick={() => go("login")}>Back to log in</button>}
            {mode !== "link" && <button type="button" className="link-button" onClick={() => go("link")}>Email me a sign-in link instead</button>}
          </div>
        </form>
      ) : (
        <div className="stack">
          <p>We emailed a code to <b>{email}</b>. Enter it here{mode === "signup" ? " to finish making your account" : mode === "reset" ? " to save your new password" : ""}.</p>
          <form onSubmit={verify} className="stack">
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} autoFocus />
            <button className="btn btn-block" disabled={busy || code.length < 6}>{busy ? "Checking…" : mode === "signup" ? "Create account" : mode === "reset" ? "Save password and log in" : "Sign in"}</button>
          </form>
          <p className="muted small">Nothing yet? Check spam and give it a minute. If the email has a <b>Sign in</b> button instead of a code, tapping it signs you in{needsCode && mode !== "link" ? "; you can set your password on your Profile page after" : ""}.</p>
          <button type="button" className="link-button" onClick={() => { setStep("form"); setCode(""); setError(""); }}>Use a different email</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
