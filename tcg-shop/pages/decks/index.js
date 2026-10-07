import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { GameChips, NotConfigured } from "../../components/Layout";
import DeckTile from "../../components/DeckTile";
import { supabase } from "../../lib/supabaseClient";
import { LIVE_GAMES, LIVE_GAME_IDS } from "../../lib/games";
import { byNewestSet, deckAvailability } from "../../lib/preorder";
import { usePreorderCounts } from "../../lib/usePreorderCounts";

const VIEWS = [["", "All"], ["stock", "In stock"], ["preorder", "Pre-orders"]];

export default function Decks() {
  const router = useRouter();
  const game = router.query.game || "";
  const view = router.query.view || "";
  const [decks, setDecks] = useState(null);
  const open = usePreorderCounts();

  useEffect(() => {
    if (!router.isReady || !supabase) return;
    let q = supabase.from("decks").select("*, deck_cards(count, card:cards(id,price,quantity))").eq("published", true).in("game", LIVE_GAME_IDS);
    if (game) q = q.eq("game", game);
    q.then(({ data }) => setDecks((data || []).sort(byNewestSet)));
  }, [router.isReady, game]);

  const go = patch => {
    const query = { ...router.query, ...patch };
    for (const k of Object.keys(query)) if (!query[k]) delete query[k];
    router.replace({ query }, undefined, { shallow: true });
  };
  const shown = (decks || []).filter(d => !view || deckAvailability(d, open[d.id] || 0).mode === view);

  return (
    <Layout title="Decks">
      <h1>Pre-built tournament decks</h1>
      <p className="muted">Complete copies of top-performing lists, newest sets first. Sold out? Pre-order and we&apos;ll build yours. Every deck credits the event and player it came from.</p>
      <GameChips games={LIVE_GAMES} value={game} onChange={g => go({ game: g })} />
      <div className="chips">
        {VIEWS.map(([id, label]) => (
          <button key={id} className={`chip ${view === id ? "active" : ""}`} onClick={() => go({ view: id })}>{label}</button>
        ))}
      </div>
      {!supabase && <NotConfigured />}
      <div className="grid">{shown.map(d => <DeckTile key={d.id} deck={d} openPreorders={open[d.id] || 0} />)}</div>
      {decks && shown.length === 0 && <p className="muted">No decks here yet.</p>}
    </Layout>
  );
}
