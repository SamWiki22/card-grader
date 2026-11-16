import Link from "next/link";
import Layout from "../components/Layout";
import ProductCard from "../components/ProductCard";
import { listProducts, shopInfo } from "../lib/catalog";
import { GAMES, money } from "../lib/shared";

export default function Home({ singles, sealed, games, info }) {
  return (
    <Layout>
      <section className="hero">
        <div className="wrap hero-row">
          <div className="hero-copy">
            <p className="eyebrow">Singles · Sealed · Good vibes</p>
            <h1>Cards worth growling about.</h1>
            <p className="lead">Hand-picked singles and factory-sealed boxes and packs from Bearded Bear TCG. Everything you see is in stock and ready to ship.</p>
            <div className="hero-ctas">
              <Link href="/shop?category=singles" className="btn">Shop singles</Link>
              <Link href="/shop?category=sealed" className="btn btn-ghost">Shop sealed</Link>
            </div>
            {info.freeShippingMin > 0 && <p className="hero-note">Free shipping on orders over {money(info.freeShippingMin)}</p>}
          </div>
          <img className="hero-logo" src="/logo.png" alt="Bearded Bear TCG" width="360" height="360" />
        </div>
      </section>

      {!info.configured && (
        <div className="wrap"><div className="notice">Store isn’t connected to inventory yet — add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> (see README).</div></div>
      )}

      {games.length > 0 && (
        <section className="wrap section">
          <h2>Shop by game</h2>
          <div className="game-grid">
            {games.map(g => (
              <Link key={g.id} href={`/shop?game=${g.id}`} className="game-tile">
                <span className="game-name">{g.label}</span>
                <span className="game-count">{g.count} item{g.count === 1 ? "" : "s"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Shelf title="New singles" href="/shop?category=singles" products={singles} empty="New singles coming soon." />
      <Shelf title="Sealed product" href="/shop?category=sealed" products={sealed} empty="Sealed product coming soon." />
    </Layout>
  );
}

function Shelf({ title, href, products, empty }) {
  return (
    <section className="wrap section">
      <div className="section-head">
        <h2>{title}</h2>
        <Link href={href} className="see-all">See all →</Link>
      </div>
      {products.length ? (
        <div className="grid">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>
      ) : <p className="muted">{empty}</p>}
    </section>
  );
}

export async function getServerSideProps({ res }) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  let products = [];
  try { products = await listProducts(); } catch (e) { console.error(e); }
  const counts = {};
  for (const p of products) counts[p.game] = (counts[p.game] || 0) + 1;
  return {
    props: {
      singles: products.filter(p => p.category === "singles").slice(0, 8),
      sealed: products.filter(p => p.category === "sealed").slice(0, 8),
      games: GAMES.filter(g => counts[g.id]).map(g => ({ ...g, count: counts[g.id] })),
      info: shopInfo(),
    },
  };
}
