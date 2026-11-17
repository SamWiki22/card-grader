import Link from "next/link";
import Layout from "../components/Layout";
import ProductCard from "../components/ProductCard";
import { listProducts, shopInfo } from "../lib/catalog";
import { packsReady } from "../lib/auth";
import { packsOverview, getBuybackRules } from "../lib/packs";
import { GAMES, GAME_LABEL, money, centsToMoney } from "../lib/shared";

export default function Home({ singles, sealed, games, info, packs, rules }) {
  const topRate = rules.length ? Math.max(...rules.map(r => r.percent)) : null;
  const lowRate = rules.length ? Math.min(...rules.map(r => r.percent)) : null;

  return (
    <Layout>
      {/* 1 · Welcome: the three things you can do here */}
      <section className="hero">
        <div className="wrap hero-row">
          <div className="hero-copy">
            <p className="eyebrow">Pokémon · Magic · Dragon Ball · One Piece</p>
            <h1 className="hero-title"><span className="ht-top">Cards worth</span>{" "}<span className="ht-big" data-text="Growling">Growling</span>{" "}<span className="ht-end">about.</span></h1>
            <p className="lead">Shop singles and sealed, rip virtual packs for real cards, or sell us your cards for credit — all in one den.</p>
            <div className="paths">
              <Link href="/shop" className="path">
                <span className="path-icon">🃏</span>
                <b>Shop cards</b>
                <span>Singles &amp; sealed, in stock and ready to ship</span>
              </Link>
              <Link href="/packs" className="path">
                <span className="path-icon">🎁</span>
                <b>Open packs</b>
                <span>{packs.length ? `From ${centsToMoney(Math.min(...packs.map(p => p.fromCents)))} — every pull is a real card` : "Every pull is a real card"}</span>
              </Link>
              <Link href="/sell" className="path">
                <span className="path-icon">💰</span>
                <b>Sell your cards</b>
                <span>{topRate ? `Get up to ${topRate}% back in credit` : "Turn your cards into pack credit"}</span>
              </Link>
            </div>
            {info.freeShippingMin > 0 && <p className="hero-note">Free shipping on orders over {money(info.freeShippingMin)}</p>}
          </div>
          <img className="hero-logo" src="/logo.png" alt="Bearded Bear TCG" width="360" height="360" />
        </div>
      </section>

      {!info.configured && (
        <div className="wrap"><div className="notice">Store isn’t connected to inventory yet — add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> (see README).</div></div>
      )}

      {/* 2 · Store previews */}
      <Shelf title="New singles" href="/shop?category=singles" products={singles} empty="New singles coming soon." />
      <Shelf title="Sealed product" href="/shop?category=sealed" products={sealed} empty="Sealed product coming soon." />

      {/* 3 · Virtual packs */}
      <section className="home-band packs-band">
        <div className="wrap section">
          <div className="band-copy">
            <p className="eyebrow">Virtual packs</p>
            <h2>Rip a pack. Pull a real card.</h2>
            <p>Every pack draws one real card from a live pool you can see before you open — with the odds shown up front. Keep your pull in your vault, ship it home, or sell it back instantly for credit.</p>
            <Link href="/packs" className="btn">Open a pack</Link>
          </div>
          {packs.length > 0 && (
            <div className="pack-teasers">
              {packs.map(p => (
                <Link key={p.game} href="/packs" className="pack-teaser">
                  <span className="teaser-game">{GAME_LABEL[p.game]}</span>
                  <span className="teaser-from">from <b>{centsToMoney(p.fromCents)}</b></span>
                  {p.top && <span className="teaser-top">Top card: {p.top.name} · <b>{centsToMoney(p.top.market_value_cents)}</b></span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4 · Sell to the Bear */}
      <section className="home-band sell-band">
        <div className="wrap section">
          <div className="band-copy">
            <p className="eyebrow">Sell to the Bear</p>
            <h2>Your cards, into our packs.</h2>
            <p>Send us photos of cards you want to sell. We make an offer; you ship them in and get paid in credit{lowRate && topRate ? ` — ${lowRate}% to ${topRate}% of market value, more for higher-value cards` : ""}. Every card we buy goes into the packs for someone else to pull.</p>
            <Link href="/sell" className="btn">Sell your cards</Link>
          </div>
          {rules.length > 0 && (
            <ul className="rate-table">
              {rules.map((r, i) => {
                const next = rules[i + 1];
                return (
                  <li key={r.min_value_cents}>
                    <span>{next ? `${centsToMoney(r.min_value_cents)} – ${centsToMoney(next.min_value_cents - 1)}` : `${centsToMoney(r.min_value_cents)}+`}</span>
                    <b>{r.percent}%</b>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* 5 · Shop by game */}
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
  let products = [], tiers = [], rules = [];
  try { products = await listProducts(); } catch (e) { console.error(e); }
  if (packsReady()) {
    try { [tiers, rules] = await Promise.all([packsOverview(), getBuybackRules()]); } catch (e) { console.error(e); }
  }
  const counts = {};
  for (const p of products) counts[p.game] = (counts[p.game] || 0) + 1;

  // One teaser per game: cheapest stocked tier, and the best card across its pools.
  const packs = GAMES.map(g => {
    const stocked = tiers.filter(t => t.game === g.id && t.poolSize > 0);
    if (!stocked.length) return null;
    const top = stocked.flatMap(t => t.showcase).sort((a, b) => b.market_value_cents - a.market_value_cents)[0] || null;
    return { game: g.id, fromCents: Math.min(...stocked.map(t => t.price_cents)), top };
  }).filter(Boolean);

  return {
    props: {
      singles: products.filter(p => p.category === "singles").slice(0, 8),
      sealed: products.filter(p => p.category === "sealed").slice(0, 8),
      games: GAMES.filter(g => counts[g.id]).map(g => ({ ...g, count: counts[g.id] })),
      info: shopInfo(),
      packs,
      rules,
    },
  };
}
