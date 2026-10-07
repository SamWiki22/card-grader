import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout, { GameChips, NotConfigured } from "../../components/Layout";
import DeckTile from "../../components/DeckTile";
import { supabase } from "../../lib/supabaseClient";
import { GAMES } from "../../lib/games";

export default function Decks() {
  const router = useRouter();
  const game = router.query.game || "";
  const [decks, setDecks] = useState(null);

  useEffect(() => {
    if (!router.isReady || !supabase) return;
    let q = supabase
      .from("decks")
      .select("*, deck_cards(count, card:cards(id,price,quantity))")
      .eq("published", true)
      .order("quantity", { ascending: false })
      .order("updated_at", { ascending: false });
    if (game) q = q.eq("game", game);
    q.then(({ data }) => setDecks(data || []));
  }, [router.isReady, game]);

  return (
    <Layout title="Pre-built Decks">
      <h1>Pre-built tournament decks</h1>
      <p className="muted">Complete, sleeve-ready copies of top-performing lists. Every deck credits the event and player it came from.</p>
      <GameChips games={GAMES} value={game} onChange={g => router.replace({ query: g ? { game: g } : {} }, undefined, { shallow: true })} />
      {!supabase && <NotConfigured />}
      <div className="grid">{(decks || []).map(d => <DeckTile key={d.id} deck={d} />)}</div>
      {decks && decks.length === 0 && <p className="muted">No decks listed for this game yet.</p>}
    </Layout>
  );
}
