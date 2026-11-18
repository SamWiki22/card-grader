import { useState } from "react";
import { useRouter } from "next/router";
import Modal from "./Modal";
import SignIn from "./SignIn";
import { useMe, postJSON } from "../lib/me";

// Team sign-in: username + password (accounts the owners create in /admin/team).
// Owners sign in with their email code instead (the link at the bottom).
function TeamLoginForm({ onDone, autoFocus = true }) {
  const router = useRouter();
  const { refresh } = useMe();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await postJSON("/api/auth/team-login", { username, password });
      await refresh();
      onDone?.();
      if (!router.pathname.startsWith("/admin")) router.push(r.role === "admin" ? "/admin/packs" : "/admin/store");
    } catch (err) { setError(err.message); setPassword(""); }
    setBusy(false);
  }

  return (
    <>
      <form className="stack team-login" onSubmit={submit}>
        <label className="field">Username
          <input className="input" autoFocus={autoFocus} autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck="false" value={username} onChange={e => setUsername(e.target.value)} required />
        </label>
        <label className="field">Password
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error small">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <button type="button" className="link-button small" onClick={() => setEmail(true)}>Owner? Sign in with your email code instead</button>
      </form>
      {email && <SignIn startMode="link" onClose={() => { setEmail(false); onDone?.(); }} reason="Owners and email-listed admins sign in with a code sent to their email." />}
    </>
  );
}

export default function TeamLogin({ onClose }) {
  return (
    <Modal title="Team sign-in" onClose={onClose}>
      <TeamLoginForm onDone={onClose} />
    </Modal>
  );
}

// Shown on admin pages when nobody with access is signed in.
export function AdminGate({ need = "staff" }) {
  return (
    <section className="wrap section admin-gate">
      <h1 className="page-title">Team sign-in</h1>
      <p className="muted">{need === "owner" ? "Only the owners can open this page. Sign in with your owner email code." : "Sign in with the username and password the owners gave you."}</p>
      <div className="admin-gate-box"><TeamLoginForm autoFocus={false} /></div>
    </section>
  );
}

// Tap the logo 5 times within 3 seconds to open the team sign-in.
// Kept at module level so taps survive the page change the first tap causes.
let taps = [];
export function secretTap(e, open) {
  const t = Date.now();
  taps = [...taps.filter(x => t - x < 3000), t];
  if (taps.length > 1) e.preventDefault(); // stay put while tapping
  if (taps.length >= 5) { taps = []; open(); }
}
