import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import SignIn from "../components/SignIn";
import AddFunds from "../components/AddFunds";
import { useMe } from "../lib/me";
import { centsToMoney } from "../lib/shared";

const KIND = { deposit: "Added funds", pack_open: "Pack opened", buyback: "Sold back", shipping: "Shipping", adjustment: "Credit from Bearded Bear", card_sale: "Sold a card to us" };

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
