import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCart } from "../lib/cart";
import { useMe } from "../lib/me";
import { centsToMoney } from "../lib/shared";

export default function Layout({ title, description, children }) {
  const { count, ready } = useCart();
  const me = useMe();
  const { pathname, query } = useRouter();
  const fullTitle = title ? `${title} · Bearded Bear TCG` : "Bearded Bear TCG — Singles & Sealed";
  const active = c => (pathname === "/shop" && query.category === c ? "nav-link active" : "nav-link");

  return (
    <>
      <Head>
        <title>{fullTitle}</title>
        <meta name="description" content={description || "Trading card singles and sealed product from Bearded Bear TCG — Pokémon, One Piece, Magic, Dragon Ball and more."} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:image" content="/logo.png" />
      </Head>
      <header className="site-header">
        <div className="wrap header-row">
          <Link href="/" className="brand">
            <img src="/logo.png" alt="" width="44" height="44" />
            <span>Bearded Bear <b>TCG</b></span>
          </Link>
          <nav className="nav">
            <Link href="/shop?category=singles" className={active("singles")}>Singles</Link>
            <Link href="/shop?category=sealed" className={active("sealed")}>Sealed</Link>
            <Link href="/packs" className={pathname.startsWith("/packs") ? "nav-link active nav-packs" : "nav-link nav-packs"}>Packs</Link>
            {me.user?.staff && <Link href="/admin/store" className={pathname.startsWith("/admin") ? "nav-link active" : "nav-link"}>{me.user.admin ? "Admin" : "Inventory"}{me.new_customer_offers ? ` (${me.new_customer_offers})` : ""}</Link>}
            {me.user && <Link href="/vault" className={pathname === "/vault" ? "nav-link active" : "nav-link"}>Vault</Link>}
          </nav>
          {me.user && <Link href="/vault" className="bal-chip" title="Pack balance">{centsToMoney(me.balance_cents)}</Link>}
          <Link href="/cart" className="cart-button" aria-label={`Cart, ${count} items`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
            <span className="cart-label">Cart</span>
            {ready && count > 0 && <span className="cart-count">{count}</span>}
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="wrap footer-row">
          <div className="brand muted"><img src="/logo.png" alt="" width="32" height="32" /> Bearded Bear TCG</div>
          <div className="footer-links">
            <Link href="/shop?category=singles">Singles</Link>
            <Link href="/shop?category=sealed">Sealed</Link>
            <Link href="/packs">Packs</Link>
            <Link href="/sell">Sell your cards</Link>
            <Link href="/packs/rules">Pack rules &amp; odds</Link>
            <Link href="/cart">Cart</Link>
          </div>
          <div className="muted small">© {new Date().getFullYear()} Bearded Bear TCG</div>
        </div>
      </footer>
    </>
  );
}
