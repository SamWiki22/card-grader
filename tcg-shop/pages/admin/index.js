import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { NotConfigured, SHOP_NAME } from "../../components/Layout";
import InventoryTab from "../../components/admin/InventoryTab";
import DecksTab from "../../components/admin/DecksTab";
import MetaTab from "../../components/admin/MetaTab";
import OrdersTab from "../../components/admin/OrdersTab";
import SourcingTab from "../../components/admin/SourcingTab";

const TABS = [
  ["meta", "Meta Decks"],
  ["decks", "Decks"],
  ["sourcing", "Pre-orders & Sourcing"],
  ["inventory", "Singles Inventory"],
  ["orders", "Orders"],
];

export default function Admin() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);
  const [tab, setTab] = useState("meta");
  const [openDeck, setOpenDeck] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return setIsAdmin(null);
    supabase.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  const goToDeck = id => { setOpenDeck(id); setTab("decks"); };

  let body;
  if (!supabase) body = <NotConfigured />;
  else if (session === undefined) body = <p className="muted">Loading…</p>;
  else if (!session) body = <Login />;
  else if (isAdmin === null) body = <p className="muted">Checking access…</p>;
  else if (!isAdmin) {
    body = (
      <div className="card">
        <h2>Not an admin</h2>
        <p>Signed in as {session.user.email}, but this account isn&apos;t in the <code>admins</code> table. In the Supabase SQL editor run:</p>
        <pre className="card small">insert into admins (user_id) values (&apos;{session.user.id}&apos;);</pre>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    );
  } else {
    body = (
      <>
        <div className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        {tab === "meta" && <MetaTab onImported={goToDeck} />}
        {tab === "decks" && <DecksTab openDeck={openDeck} setOpenDeck={setOpenDeck} />}
        {tab === "sourcing" && <SourcingTab onOpenDeck={goToDeck} />}
        {tab === "inventory" && <InventoryTab />}
        {tab === "orders" && <OrdersTab />}
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Admin · {SHOP_NAME}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </Head>
      <header className="header">
        <div className="container">
          <Link href="/" className="logo">{SHOP_NAME}</Link>
          <span className="nav muted">Admin</span>
          {session && <button className="btn small" onClick={() => supabase.auth.signOut()}>Sign out</button>}
        </div>
      </header>
      <main className="container">{body}</main>
    </>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async e => {
    e.preventDefault();
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
  };
  return (
    <form className="card stack" style={{ maxWidth: 380, margin: "40px auto" }} onSubmit={submit}>
      <h2>Admin sign in</h2>
      <div><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
      <div><label>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
      {error && <div className="error">{error}</div>}
      <button className="btn primary">Sign in</button>
      <p className="small muted">Create the user in Supabase → Authentication → Users, then add it to the <code>admins</code> table.</p>
    </form>
  );
}
