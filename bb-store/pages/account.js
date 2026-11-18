import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import SignIn from "../components/SignIn";
import AddFunds from "../components/AddFunds";
import { useMe, postJSON } from "../lib/me";
import { centsToMoney } from "../lib/shared";

const KIND = { deposit: "Added funds", pack_open: "Pack opened", buyback: "Sold a card", shipping: "Shipping", adjustment: "Credit from Bearded Bear", card_sale: "Sold a card to us" };

export default function Account() {
  const me = useMe();
  const [modal, setModal] = useState(null);
  const [ledger, setLedger] = useState(null);

  useEffect(() => {
    if (!me.user) return;
    fetch("/api/vault").then(r => r.ok ? r.json() : null).then(d => d && setLedger(d.ledger));
  }, [me.user]);

  if (!me.loading && !me.user) {
    return (
      <AppShell title="Profile">
        <div className="app-empty">
          <img src="/logo.png" alt="" width="110" height="110" />
          <h1>Profile</h1>
          <p>Sign in to open packs, track your pulls and manage your balance.</p>
          {me.ready ? <button className="buy-btn narrow" onClick={() => setModal("signin")}><span>Sign in</span></button> : <p className="dim">Packs aren’t set up yet.</p>}
        </div>
        {modal === "signin" && <SignIn onClose={() => setModal(null)} />}
      </AppShell>
    );
  }

  return (
    <AppShell title="Profile">
      <div className="app-head">
        <h1>Profile</h1>
        <p className="dim">{me.user?.email}</p>
      </div>

      <section className="balance-card">
        <span className="caps">Balance</span>
        <b>{centsToMoney(me.balance_cents)}</b>
        <button className="buy-btn" onClick={() => setModal("funds")}><span>+ Add funds</span></button>
      </section>

      <PasswordBox hasPassword={!!me.user?.has_password} onSaved={me.refresh} />

      <section className="app-section">
        <h2>Activity</h2>
        {!ledger ? <p className="dim">Loading…</p> : !ledger.length ? <p className="dim">Nothing yet — <Link href="/packs">open your first pack</Link>.</p> : (
          <ul className="app-list">
            {ledger.map(l => (
              <li key={l.id}>
                <span>{KIND[l.kind] || l.kind}<span className="dim small"> · {l.note} · {new Date(l.created_at).toLocaleDateString()}</span></span>
                <b className={l.amount_cents >= 0 ? "up" : "down"}>{l.amount_cents >= 0 ? "+" : "−"}{centsToMoney(Math.abs(l.amount_cents))}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="app-section links">
        <Link href="/packs/rules" className="app-link">Odds &amp; rules</Link>
        {me.user?.admin && <Link href="/admin/packs" className="app-link">Admin</Link>}
        <Link href="/" className="app-link">Bearded Bear shop</Link>
        <button className="app-link" onClick={me.signOut}>Sign out</button>
      </section>

      {modal === "funds" && <AddFunds onClose={() => setModal(null)} />}
    </AppShell>
  );
}

// Set a password so they can log in without an email code next time (or change it).
function PasswordBox({ hasPassword, onSaved }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try { await postJSON("/api/auth/set-password", { password: pw }); setPw(""); setOpen(false); setMsg("Password saved. Log in with your email and password next time."); onSaved(); }
    catch (err) { setMsg(err.message); }
    setBusy(false);
  }
  return (
    <section className="app-section">
      <h2>Password</h2>
      {!open ? (
        <>
          <p className="dim small">{hasPassword ? "You can log in with your email and password." : "Set a password to log in without waiting for an email code."}</p>
          <button className="ghost-btn" onClick={() => { setOpen(true); setMsg(""); }}>{hasPassword ? "Change password" : "Set a password"}</button>
        </>
      ) : (
        <form className="stack" onSubmit={save}>
          <input className="input" type="password" autoComplete="new-password" minLength={8} required placeholder="New password (8+ characters)" value={pw} onChange={e => setPw(e.target.value)} autoFocus />
          <button className="buy-btn" disabled={busy}><span>{busy ? "Saving…" : "Save password"}</span></button>
          <button type="button" className="ghost-btn" onClick={() => setOpen(false)}>Cancel</button>
        </form>
      )}
      {msg && <p className="app-banner" style={{ marginTop: 10 }}>{msg}</p>}
    </section>
  );
}
