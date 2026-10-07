import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCart } from "../lib/cart";

export const SHOP_NAME = process.env.NEXT_PUBLIC_SHOP_NAME || "Deck & Singles";

export default function Layout({ title, children }) {
  const { count } = useCart();
  const { pathname } = useRouter();
  const nav = [
    ["/singles", "Singles"],
    ["/decks", "Pre-built Decks"],
  ];
  return (
    <>
      <Head>
        <title>{title ? `${title} · ${SHOP_NAME}` : SHOP_NAME}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <header className="header">
        <div className="container">
          <Link href="/" className="logo">{SHOP_NAME}</Link>
          <nav className="nav">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className={pathname.startsWith(href) ? "active" : ""}>{label}</Link>
            ))}
          </nav>
          <Link href="/cart" className="btn">🛒 {count}</Link>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}

export function NotConfigured() {
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <h2>Store not connected yet</h2>
      <p className="muted">Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (see <code>.env.example</code>) and run <code>supabase/schema.sql</code>.</p>
    </div>
  );
}

export function GameChips({ value, onChange, games }) {
  return (
    <div className="chips">
      <button className={`chip ${!value ? "active" : ""}`} onClick={() => onChange("")}>All games</button>
      {games.map(g => (
        <button key={g.id} className={`chip ${value === g.id ? "active" : ""}`} onClick={() => onChange(g.id)}>{g.icon} {g.label}</button>
      ))}
    </div>
  );
}
