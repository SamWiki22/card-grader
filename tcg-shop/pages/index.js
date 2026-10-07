import { useEffect, useState } from "react";
import Link from "next/link";
import Layout, { NotConfigured } from "../components/Layout";
import DeckTile from "../components/DeckTile";
import { supabase } from "../lib/supabaseClient";
import { GAMES } from "../lib/games";
import { byNewestSet, deckAvailability } from "../lib/preorder";
import { usePreorderCounts } from "../lib/usePreorderCounts";

export default function Home() {
  const [decks, setDecks] = useState([]);
  const open = usePreorderCounts();
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("decks")
      .select("*, deck_cards(count, card:cards(id,price,quantity))")
      .eq("published", true)
      .order("updated_at", { ascending: false })
      .limit(60)
      .then(({ data }) => setDecks((data || []).sort(byNewestSet)));
  }, []);

  const preorders = decks.filter(d => deckAvailability(d, open[d.id] || 0).mode === "preorder").slice(0, 8);
  const inStock = decks.filter(d => d.quantity > 0).slice(0, 8);

  return (
    <Layout>
      <section className="hero">
        <h1>Tournament-proven decks, built from the newest sets</h1>
        <p>Pre-order the lists winning events right now and we&apos;ll build them for you, or grab a built deck off the shelf. Singles available to finish or upgrade your own.</p>
        <div className="row">
          <Link href="/decks" className="btn">Shop decks</Link>
          <Link href="/decks?view=preorder" className="btn">Pre-orders</Link>
          <Link href="/singles" className="btn">Shop singles</Link>
        </div>
      </section>
      {!supabase && <NotConfigured />}
      {preorders.length > 0 && (
        <>
          <h2>Pre-order now</h2>
          <div className="grid" style={{ marginBottom: 28 }}>{preorders.map(d => <DeckTile key={d.id} deck={d} openPreorders={open[d.id] || 0} />)}</div>
        </>
      )}
      {inStock.length > 0 && (
        <>
          <h2>Built &amp; ready to ship</h2>
          <div className="grid" style={{ marginBottom: 28 }}>{inStock.map(d => <DeckTile key={d.id} deck={d} openPreorders={open[d.id] || 0} />)}</div>
        </>
      )}
      <h2>Games</h2>
      <div className="grid">
        {GAMES.map(g => (
          <Link key={g.id} href={`/decks?game=${g.id}`} className="card link">
            <div style={{ fontSize: 26 }}>{g.icon}</div>
            <strong>{g.label}</strong>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
