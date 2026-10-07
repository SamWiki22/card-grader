import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout, { GameChips, NotConfigured } from "../components/Layout";
import { supabase } from "../lib/supabaseClient";
import { GAMES, gameLabel } from "../lib/games";
import { money } from "../lib/pricing";
import { useCart } from "../lib/cart";

const PAGE = 60;

export default function Singles() {
  const router = useRouter();
  const game = router.query.game || "";
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const { add, items } = useCart();

  const load = async (offset = 0) => {
    if (!supabase) return;
    setLoading(true);
    let query = supabase.from("cards").select("*").gt("quantity", 0).gt("price", 0).order("name").range(offset, offset + PAGE - 1);
    if (game) query = query.eq("game", game);
    if (q.trim()) query = query.ilike("name", `%${q.trim().replace(/[%_]/g, "")}%`);
    const { data } = await query;
    setRows(prev => (offset ? [...prev, ...(data || [])] : data || []));
    setMore((data || []).length === PAGE);
    setLoading(false);
  };

  useEffect(() => {
    if (!router.isReady) return;
    const t = setTimeout(() => load(0), 250);
    return () => clearTimeout(t);
  }, [router.isReady, game, q]);

  const inCart = useMemo(() => Object.fromEntries(items.filter(i => i.kind === "card").map(i => [i.id, i.quantity])), [items]);

  return (
    <Layout title="Singles">
      <h1>Singles</h1>
      <GameChips games={GAMES} value={game} onChange={g => router.replace({ query: g ? { game: g } : {} }, undefined, { shallow: true })} />
      <input placeholder="Search card name…" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 16, maxWidth: 420 }} />
      {!supabase && <NotConfigured />}
      <div className="grid">
        {rows.map(c => {
          const left = c.quantity - (inCart[c.id] || 0);
          return (
            <div key={c.id} className="card">
              {c.image_url && <img className="thumb" src={c.image_url} alt={c.name} loading="lazy" />}
              <div className="small muted">{gameLabel(c.game)}</div>
              <strong>{c.name}</strong>
              <div className="small muted">{[c.set_code, c.number, c.rarity, c.finish, c.condition].filter(Boolean).join(" · ")}</div>
              <div className="spread" style={{ marginTop: 8 }}>
                <span className="price">{money(c.price)}</span>
                <span className="small muted">{c.quantity} in stock</span>
              </div>
              <button className="btn primary" style={{ marginTop: 10, width: "100%", justifyContent: "center" }} disabled={left <= 0}
                onClick={() => add({ kind: "card", id: c.id, name: c.name, detail: [c.set_code, c.condition].filter(Boolean).join(" · "), price: Number(c.price), max: c.quantity })}>
                {left <= 0 ? "All in cart" : "Add to cart"}
              </button>
            </div>
          );
        })}
      </div>
      {!loading && supabase && rows.length === 0 && <p className="muted">No singles found.</p>}
      {more && <button className="btn" style={{ marginTop: 16 }} onClick={() => load(rows.length)} disabled={loading}>Load more</button>}
    </Layout>
  );
}
