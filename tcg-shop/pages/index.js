import { useEffect, useState } from "react";
import Link from "next/link";
import Layout, { NotConfigured } from "../components/Layout";
import DeckTile from "../components/DeckTile";
import { supabase } from "../lib/supabaseClient";
import { GAMES } from "../lib/games";

export default function Home() {
  const [decks, setDecks] = useState([]);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("decks")
      .select("*, deck_cards(count, card:cards(id,price,quantity))")
      .eq("published", true)
      .gt("quantity", 0)
      .order("updated_at", { ascending: false })
      .limit(8)
      .then(({ data }) => setDecks(data || []));
  }, []);

  return (
    <Layout>
      <section className="hero">
        <h1>Tournament-proven decks, built and ready to play</h1>
        <p>Pre-built copies of the lists winning events right now, plus singles to finish or upgrade your own deck.</p>
        <div className="row">
          <Link href="/decks" className="btn">Shop decks</Link>
          <Link href="/singles" className="btn">Shop singles</Link>
        </div>
      </section>
      {!supabase && <NotConfigured />}
      <h2>Games</h2>
      <div className="grid" style={{ marginBottom: 28 }}>
        {GAMES.map(g => (
          <Link key={g.id} href={`/decks?game=${g.id}`} className="card link">
            <div style={{ fontSize: 26 }}>{g.icon}</div>
            <strong>{g.label}</strong>
          </Link>
        ))}
      </div>
      {decks.length > 0 && (
        <>
          <h2>Latest decks</h2>
          <div className="grid">{decks.map(d => <DeckTile key={d.id} deck={d} />)}</div>
        </>
      )}
    </Layout>
  );
}
