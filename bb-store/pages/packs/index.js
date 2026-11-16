import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import AppShell from "../../components/AppShell";
import PackArt, { CardImage } from "../../components/PackArt";
import SignIn from "../../components/SignIn";
import AddFunds from "../../components/AddFunds";
import { useMe, postJSON } from "../../lib/me";
import { GAMES, GAME_LABEL, GAME_COLOR, centsToMoney } from "../../lib/shared";
import { packsReady } from "../../lib/auth";
import { packsOverview, getBuybackRules } from "../../lib/packs";

const wait = ms => new Promise(r => setTimeout(r, ms));
const pct = c => (c >= 0.1 ? `${Math.round(c * 100)}%` : `${(c * 100).toFixed(1)}%`);
// Ladder rungs, cheapest (0) to chase (4).
const RUNG = [
  { name: "Base", color: "#8fa3bf" },
  { name: "Solid", color: "#4fc3b6" },
  { name: "Hit", color: "#e0b04a" },
  { name: "Big hit", color: "#d9853b" },
  { name: "Chase", color: "#e0605a" },
];
const money0 = c => (c % 100 === 0 ? `$${(c / 100).toLocaleString("en-US")}` : centsToMoney(c));

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
      <AppShell title="Packs">
        <div className="app-empty">
          <img src="/logo.png" alt="" width="120" height="120" />
          <h1>Packs are coming soon</h1>
          <p>Rip digital packs, pull real graded cards, keep them or sell them back instantly.</p>
        </div>
      </AppShell>
    );
  }

  const top = tier.showcase[0];
  let cta;
  if (!me.user) cta = `Sign in to open — ${money0(tier.price_cents)}`;
  else if (!tier.poolSize) cta = "Restocking — check back soon";
  else if (short > 0) cta = `Add funds — ${centsToMoney(short)} short`;
  else cta = `Open pack — ${money0(tier.price_cents)}`;

  const bar = (
    <div className="buy-bar">
      <div className="buy-bar-inner">
        <div className="buy-bar-top">
          <span className="caps">Balance</span>
          <span className="buy-bal">{me.user ? centsToMoney(me.balance_cents) : "—"}</span>
          <button className="add-link" onClick={() => setModal(me.user ? "funds" : "signin")}>+ Add funds</button>
        </div>
        <button className="buy-btn" onClick={open} disabled={!!opening || (me.user && !tier.poolSize) || me.loading}>
          <img className="buy-btn-logo" src="/logo.png" alt="" />
          <span>{cta}</span>
        </button>
        {error && <p className="buy-error">{error}</p>}
        <p className="buy-fine">18+ · One random card per pack · Sell back for up to {buybackPercent}%</p>
      </div>
    </div>
  );

  return (
    <AppShell title="Packs" bar={bar}>
      {funded && <p className="app-banner">Payment received! Your balance updates in a few seconds.</p>}

      <div className="seg" role="group" aria-label="Game">
        {games.map(g => (
          <button key={g.id} className={`seg-btn${g.id === game ? " on" : ""}`} style={{ "--g": GAME_COLOR[g.id] }} onClick={() => pickGame(g.id)} aria-pressed={g.id === game}>
            <span className="seg-swatch" />{g.label}
          </button>
        ))}
      </div>

      <div className="tiers" role="group" aria-label="Pack tier">
        {gameTiers.map(t => (
          <button key={t.id} className={`tier-tab${t.id === tier.id ? " on" : ""}`} style={{ "--tier": t.color }} onClick={() => { setTierId(t.id); setError(""); }} aria-pressed={t.id === tier.id}>
            <span className="tier-tab-name">{t.name}</span>
            <span className="tier-tab-price">{money0(t.price_cents)}</span>
          </button>
        ))}
      </div>

      <div className="stage">
        <PackArt tier={tier} gameLabel={GAME_LABEL[tier.game]} />
        {top && <CardImage card={top} className="stage-peek" />}
      </div>

      {top ? (
        <div className="top-card">
          <p className="kicker">Best card in the {tier.name} pool</p>
          <h1>{top.name}</h1>
          <div className="top-meta">
            {top.grade && <span className="slab-label">{top.grade}</span>}
            <span className="top-value">{money0(top.market_value_cents)}</span>
          </div>
        </div>
      ) : <p className="top-card dim">This pack is being restocked.</p>}

      {tier.showcase.length > 0 && (
        <section className="in-pack">
          <div className="section-row">
            <h2>What’s in the pool</h2>
            <a href="#odds" className="text-link">Odds ↓</a>
          </div>
          <div className="in-pack-scroll">
            {tier.showcase.map(c => (
              <div key={c.id} className="in-pack-card">
                <CardImage card={c} />
                <div className="in-pack-name">{c.name}</div>
                <div className="in-pack-value">{money0(c.market_value_cents)}</div>
              </div>
            ))}
          </div>
          <p className="dim small">{tier.poolSize} real cards are sitting in this pool. Every pack pulls one of them at random.</p>
        </section>
      )}

      {tier.odds.length > 0 && (
        <section className="ladder" id="odds">
          <div className="ladder-head">
            <h2>The {tier.name} ladder</h2>
            <span className="updated"><i /> Updates live</span>
          </div>
          <div className="ladder-bar" aria-hidden="true">
            {tier.odds.map(b => <span key={b.band} style={{ flexGrow: Math.max(b.chance, 0.015), background: RUNG[b.band].color }} />)}
          </div>
          <ol className="rungs">
            {[...tier.odds].reverse().map(b => (
              <li key={b.band} className="rung" style={{ "--c": RUNG[b.band].color }}>
                <span className="rung-name">{RUNG[b.band].name}</span>
                <span className="rung-range">{b.minCents === b.maxCents ? money0(b.minCents) : `${money0(b.minCents)} – ${money0(b.maxCents)}`}</span>
                <span className="rung-pct">{pct(b.chance)}</span>
              </li>
            ))}
          </ol>
          <p className="dim small ladder-note">Chances come straight from the cards in the pool right now and shift as cards are pulled or sold back.</p>
          <Link href="/packs/rules" className="text-link">How odds work →</Link>
        </section>
      )}

      {opening && (
        <div className="reveal-backdrop">
          {opening.stage === "shaking" ? (
            <div className="reveal-pack"><PackArt tier={tier} gameLabel={GAME_LABEL[tier.game]} state="opening" /><p className="dim">Ripping…</p></div>
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
    </AppShell>
  );
}

function Reveal({ opening, tier, busy, onSell, onKeep, onAgain, canAgain }) {
  const { card, buyback_cents, buyback_percent } = opening.result;
  const ratio = card.market_value_cents / tier.price_cents;
  const hit = ratio >= 10 ? "chase" : ratio >= 3 ? "hit" : "";
  return (
    <div className={`reveal ${hit}`}>
      {hit && <p className="reveal-burst">{hit === "chase" ? "CHASE PULL!" : "Big hit!"}</p>}
      <CardImage card={card} className="reveal-card" />
      <h2>{card.name}</h2>
      {card.set_name && <p className="dim">{card.set_name}</p>}
      <div className="top-meta">{card.grade && <span className="slab-label">{card.grade}</span>}<span className="top-value">{centsToMoney(card.market_value_cents)}</span></div>
      {opening.stage === "sold" ? (
        <>
          <p className="app-banner">Sold back for {centsToMoney(opening.sold)} — added to your balance.</p>
          <div className="reveal-actions">
            <button className="buy-btn" onClick={onAgain} disabled={!canAgain}><span>Open another — {money0(tier.price_cents)}</span></button>
            <button className="ghost-btn" onClick={onKeep}>Done</button>
          </div>
        </>
      ) : (
        <div className="reveal-actions">
          <button className="sell-btn" onClick={onSell} disabled={busy}>{busy ? "Selling…" : `Sell back for ${centsToMoney(buyback_cents)} (${buyback_percent}%)`}</button>
          <button className="ghost-btn" onClick={onKeep}>Keep in vault</button>
          <button className="buy-btn" onClick={onAgain} disabled={!canAgain}><span>Open another — {money0(tier.price_cents)}</span></button>
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps({ res }) {
  res.setHeader("Cache-Control", "no-store");
  if (!packsReady()) return { props: { tiers: [], ready: false, buybackPercent: 0 } };
  let tiers = [], rules = [];
  try { [tiers, rules] = await Promise.all([packsOverview(), getBuybackRules()]); } catch (e) { console.error(e); }
  return { props: { tiers, ready: true, buybackPercent: Math.max(0, ...rules.map(r => r.percent)) } };
}
