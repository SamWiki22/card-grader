import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import PackArt, { CardImage } from "../../components/PackArt";
import SignIn from "../../components/SignIn";
import AddFunds from "../../components/AddFunds";
import { useMe, postJSON } from "../../lib/me";
import { GAMES, GAME_LABEL, centsToMoney } from "../../lib/shared";
import { packsReady } from "../../lib/auth";
import { packsOverview, BUYBACK_PERCENT } from "../../lib/packs";

const wait = ms => new Promise(r => setTimeout(r, ms));
const pct = c => (c >= 0.1 ? `${Math.round(c * 100)}%` : `${(c * 100).toFixed(1)}%`);

export default function Packs({ tiers, ready, buybackPercent }) {
  const me = useMe();
  const router = useRouter();
  const games = useMemo(() => GAMES.filter(g => tiers.some(t => t.game === g.id)), [tiers]);
  const [game, setGame] = useState(games[0]?.id || "");
  const gameTiers = tiers.filter(t => t.game === game);
  const [tierId, setTierId] = useState(gameTiers[1]?.id || gameTiers[0]?.id || "");
  const tier = tiers.find(t => t.id === tierId) || gameTiers[0];

  const [modal, setModal] = useState(null);        // "signin" | "funds"
  const [opening, setOpening] = useState(null);    // { stage: "shaking" | "reveal" | "sold", result, sold }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [funded, setFunded] = useState(false);

  // Back from Stripe: the webhook credits the balance a moment later.
  useEffect(() => {
    if (!router.query.funded) return;
    setFunded(true);
    const timers = [1500, 4000, 9000].map(ms => setTimeout(me.refresh, ms));
    router.replace("/packs", undefined, { shallow: true, scroll: false });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.funded]);

  function pickGame(id) {
    setGame(id);
    const list = tiers.filter(t => t.game === id);
    setTierId(list[1]?.id || list[0]?.id);
    setError("");
  }

  const refreshPool = () => router.replace(router.asPath, undefined, { scroll: false });
  const short = tier && me.user ? Math.max(0, tier.price_cents - me.balance_cents) : 0;

  async function open() {
    setError("");
    if (!me.user) return setModal("signin");
    if (short > 0) return setModal("funds");
    setOpening({ stage: "shaking" });
    const started = Date.now();
    try {
      const result = await postJSON("/api/packs/open", { tier: tier.id });
      await wait(Math.max(0, 1600 - (Date.now() - started)));
      me.setBalance(result.balance_cents);
      setOpening({ stage: "reveal", result });
      refreshPool();
    } catch (e) {
      setOpening(null);
      setError(e.message);
      if (e.status === 402) setModal("funds");
      me.refresh();
    }
  }

  async function sellBack() {
    setBusy(true);
    try {
      const r = await postJSON("/api/vault/sell", { card: opening.result.card.id });
      me.setBalance(r.balance_cents);
      setOpening(o => ({ ...o, stage: "sold", sold: r.amount_cents }));
      refreshPool();
    } catch (e) { setError(e.message); setOpening(null); }
    setBusy(false);
  }

  if (!ready || !tiers.length) {
    return (
      <Layout title="Packs">
        <section className="packs-page"><div className="wrap section empty dark">
          <img src="/logo.png" alt="" width="120" height="120" />
          <h1 className="page-title">Bearded Bear Packs are coming soon</h1>
          <p>Rip digital packs, pull real graded cards, keep them or sell them back instantly.</p>
        </div></section>
      </Layout>
    );
  }

  const top = tier.showcase[0];
  let cta;
  if (!me.user) cta = `Sign in to open · ${centsToMoney(tier.price_cents)}`;
  else if (!tier.poolSize) cta = "Restocking — check back soon";
  else if (short > 0) cta = `Add funds — ${centsToMoney(short)} short`;
  else cta = `Open ${tier.name} · ${centsToMoney(tier.price_cents)}`;

  return (
    <Layout title="Packs" description="Open Bearded Bear digital packs and pull real graded cards — keep them, ship them, or sell them back instantly.">
      <div className="packs-page">
        <div className="wrap packs-wrap">
          {funded && <p className="banner">Payment received! Your balance updates in a few seconds.</p>}

          <div className="chip-row" role="tablist" aria-label="Game">
            {games.map(g => (
              <button key={g.id} role="tab" aria-selected={g.id === game} className={`chip${g.id === game ? " on" : ""}`} onClick={() => pickGame(g.id)}>{g.label}</button>
            ))}
          </div>

          <div className="tier-row" role="tablist" aria-label="Pack tier">
            {gameTiers.map(t => (
              <button key={t.id} role="tab" aria-selected={t.id === tier.id} className={`tier${t.id === tier.id ? " on" : ""}`} style={{ "--tier": t.color }} onClick={() => { setTierId(t.id); setError(""); }}>
                <span className="tier-name">{t.name}</span>
                <span className="tier-price">{centsToMoney(t.price_cents)}</span>
              </button>
            ))}
          </div>

          <div className="pack-stage">
            <PackArt tier={tier} gameLabel={GAME_LABEL[tier.game]} />
            {top && <CardImage card={top} className="peek" />}
          </div>

          {top ? (
            <div className="top-card">
              <p className="eyebrow">Top card in this pack</p>
              <h2>{top.name}</h2>
              <div className="top-meta">{top.grade && <span className="grade-pill">{top.grade}</span>}<span className="top-value">{centsToMoney(top.market_value_cents)}</span></div>
            </div>
          ) : <p className="top-card muted-light">This pack is being restocked.</p>}

          {tier.showcase.length > 0 && (
            <section className="pool">
              <div className="pool-head"><h3>In this pack right now</h3><a href="#odds" className="ghost-pill">See the odds</a></div>
              <div className="pool-scroll">
                {tier.showcase.map(c => (
                  <div key={c.id} className="pool-card">
                    <CardImage card={c} />
                    <div className="pool-name">{c.name}</div>
                    <div className="pool-value">{centsToMoney(c.market_value_cents)}</div>
                  </div>
                ))}
              </div>
              <p className="muted-light small">Real cards sitting in this pack’s pool ({tier.poolSize} total). Which one you pull is random — odds below.</p>
            </section>
          )}

          {tier.odds.length > 0 && (
            <section className="odds" id="odds">
              <div className="odds-head"><h3>{tier.name} odds</h3><span className="live"><i /> Live</span></div>
              <div className="odds-cols"><span>Card value</span><span>Chance</span></div>
              {tier.odds.map((b, i) => (
                <div key={i} className="odds-row">
                  <span className="odds-range">{b.minCents === b.maxCents ? centsToMoney(b.minCents) : `${centsToMoney(b.minCents)}–${centsToMoney(b.maxCents)}`}</span>
                  <span className="odds-bar"><span style={{ width: `${Math.max(2, b.chance * 100)}%` }} /></span>
                  <span className="odds-pct">{pct(b.chance)}</span>
                </div>
              ))}
              <p className="muted-light small">Calculated from the cards in the pool right now. Every pull is drawn on our server with a cryptographic random number and logged.</p>
              <Link href="/packs/rules" className="ghost-pill">Full odds &amp; rules</Link>
            </section>
          )}
        </div>

        <div className="open-bar">
          <div className="wrap open-bar-inner">
            <div className="open-bar-top">
              {me.user ? (
                <>
                  <span className="bal-label">Balance</span>
                  <span className="bal">{centsToMoney(me.balance_cents)}</span>
                  <button className="link-light" onClick={() => setModal("funds")}>+ Add funds</button>
                </>
              ) : <span className="bal-label">Sign in to open packs · 18+</span>}
            </div>
            <button className="open-btn" style={{ "--tier": tier.color }} onClick={open} disabled={!!opening || (me.user && !tier.poolSize) || me.loading}>{cta}</button>
            {error && <p className="error center">{error}</p>}
            <p className="fine">18+ · Randomized · {GAME_LABEL[tier.game]} cards only · Sell back any pull for {buybackPercent}% of market value</p>
          </div>
        </div>
      </div>

      {opening && (
        <div className="reveal-backdrop">
          {opening.stage === "shaking" ? (
            <div className="reveal-pack"><PackArt tier={tier} gameLabel={GAME_LABEL[tier.game]} state="opening" /><p className="muted-light">Ripping…</p></div>
          ) : (
            <Reveal opening={opening} tier={tier} busy={busy} onSell={sellBack}
              onKeep={() => setOpening(null)}
              onAgain={() => { setOpening(null); setTimeout(open, 50); }}
              canAgain={me.balance_cents >= tier.price_cents} />
          )}
        </div>
      )}

      {modal === "signin" && <SignIn onClose={() => setModal(null)} reason="Sign in to open packs and keep your pulls in your vault." />}
      {modal === "funds" && <AddFunds onClose={() => setModal(null)} shortCents={short} />}
    </Layout>
  );
}

function Reveal({ opening, tier, busy, onSell, onKeep, onAgain, canAgain }) {
  const { card, buyback_cents, buyback_percent } = opening.result;
  const ratio = card.market_value_cents / tier.price_cents;
  const tierClass = ratio >= 10 ? "chase" : ratio >= 3 ? "hit" : "";
  return (
    <div className={`reveal ${tierClass}`}>
      {tierClass && <p className="reveal-burst">{tierClass === "chase" ? "CHASE PULL!" : "Big hit!"}</p>}
      <CardImage card={{ ...card }} className="reveal-card" />
      <h2>{card.name}</h2>
      {card.set_name && <p className="muted-light">{card.set_name}</p>}
      <div className="top-meta">{card.grade && <span className="grade-pill">{card.grade}</span>}<span className="top-value">{centsToMoney(card.market_value_cents)}</span></div>
      {opening.stage === "sold" ? (
        <>
          <p className="banner">Sold back for {centsToMoney(opening.sold)} — added to your balance.</p>
          <div className="reveal-actions">
            <button className="open-btn" style={{ "--tier": tier.color }} onClick={onAgain} disabled={!canAgain}>Open another · {centsToMoney(tier.price_cents)}</button>
            <button className="ghost-btn" onClick={onKeep}>Done</button>
          </div>
        </>
      ) : (
        <div className="reveal-actions">
          <button className="ghost-btn" onClick={onKeep}>Keep in vault</button>
          <button className="sell-btn" onClick={onSell} disabled={busy}>{busy ? "Selling…" : `Sell back ${centsToMoney(buyback_cents)} (${buyback_percent}%)`}</button>
          <button className="open-btn" style={{ "--tier": tier.color }} onClick={onAgain} disabled={!canAgain}>Open another · {centsToMoney(tier.price_cents)}</button>
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps({ res }) {
  res.setHeader("Cache-Control", "no-store");
  if (!packsReady()) return { props: { tiers: [], ready: false, buybackPercent: BUYBACK_PERCENT } };
  let tiers = [];
  try { tiers = await packsOverview(); } catch (e) { console.error(e); }
  return { props: { tiers, ready: true, buybackPercent: BUYBACK_PERCENT } };
}
