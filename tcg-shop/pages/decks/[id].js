import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import { sourceLine } from "../../components/DeckTile";
import { supabase } from "../../lib/supabaseClient";
import { gameLabel } from "../../lib/games";
import { deckPricing, money } from "../../lib/pricing";
import { formatDecklist, deckSize } from "../../lib/decklist";
import { useCart } from "../../lib/cart";

export default function DeckPage() {
  const { query, isReady } = useRouter();
  const [deck, setDeck] = useState(undefined);
  const [copied, setCopied] = useState(false);
  const { add, items } = useCart();

  useEffect(() => {
    if (!isReady || !supabase) return;
    supabase
      .from("decks")
      .select("*, deck_cards(*, card:cards(id,name,price,quantity,image_url))")
      .eq("id", query.id)
      .maybeSingle()
      .then(({ data }) => setDeck(data || null));
  }, [isReady, query.id]);

  const sections = useMemo(() => {
    const m = new Map();
    for (const dc of [...(deck?.deck_cards || [])].sort((a, b) => a.sort - b.sort)) {
      if (!m.has(dc.section)) m.set(dc.section, []);
      m.get(dc.section).push(dc);
    }
    return [...m];
  }, [deck]);

  if (deck === undefined) return <Layout><p className="muted">Loading…</p></Layout>;
  if (!deck) return <Layout><h1>Deck not found</h1><Link href="/decks">Back to decks</Link></Layout>;

  const { price, singlesTotal, complete, savings } = deckPricing(deck, deck.deck_cards);
  const source = sourceLine(deck);
  const inCart = items.find(i => i.kind === "deck" && i.id === deck.id)?.quantity || 0;
  const canBuy = price > 0 && deck.quantity - inCart > 0;

  const copyList = async () => {
    await navigator.clipboard.writeText(formatDecklist(deck.deck_cards));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Layout title={deck.name}>
      <Link href="/decks" className="small muted">← All decks</Link>
      <div className="spread" style={{ alignItems: "flex-start", margin: "10px 0 20px" }}>
        <div>
          <div className="muted small">{gameLabel(deck.game)}{deck.format ? ` · ${deck.format}` : ""}{deck.archetype ? ` · ${deck.archetype}` : ""}</div>
          <h1 style={{ margin: "4px 0" }}>{deck.name}</h1>
          {source && (
            <div className="muted">
              🏆 {source}
              {deck.source_url && <> · <a href={deck.source_url} target="_blank" rel="noreferrer">{deck.source_name || "source"}</a></>}
            </div>
          )}
        </div>
        <div className="card" style={{ minWidth: 260 }}>
          <div className="price" style={{ fontSize: 24 }}>{money(price)}</div>
          {complete && savings > 0 && <div className="small muted">{money(singlesTotal)} as singles: you save {money(savings)}</div>}
          <div className="small" style={{ margin: "8px 0" }}>
            {deck.quantity > 0 ? <span className="badge ok">{deck.quantity} built &amp; ready to ship</span> : <span className="badge bad">Sold out</span>}
          </div>
          <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} disabled={!canBuy}
            onClick={() => add({ kind: "deck", id: deck.id, name: deck.name, detail: "Pre-built deck", price, max: deck.quantity })}>
            {deck.quantity > 0 && inCart >= deck.quantity ? "All in cart" : "Add deck to cart"}
          </button>
        </div>
      </div>
      {deck.description && <p style={{ whiteSpace: "pre-wrap" }}>{deck.description}</p>}
      <div className="spread"><h2 style={{ margin: 0 }}>Decklist ({deckSize(deck.deck_cards)} cards)</h2>
        <button className="btn small" onClick={copyList}>{copied ? "Copied!" : "Copy list"}</button></div>
      <div className="grid" style={{ marginTop: 14 }}>
        {sections.map(([section, list]) => (
          <div key={section} className="card">
            <h3 style={{ textTransform: "capitalize" }}>{section} ({deckSize(list)})</h3>
            <table><tbody>
              {list.map(dc => (
                <tr key={dc.id}>
                  <td style={{ width: 30 }}>{dc.count}</td>
                  <td>{dc.name}{dc.set_code && dc.number !== dc.name ? <span className="muted small"> {dc.set_code} {dc.number}</span> : null}</td>
                  <td className="small" style={{ textAlign: "right" }}>
                    {dc.card?.quantity > 0 && dc.card.price > 0 ? (
                      <button className="btn small" title="Buy this card as a single"
                        onClick={() => add({ kind: "card", id: dc.card.id, name: dc.card.name, price: Number(dc.card.price), max: dc.card.quantity })}>
                        {money(dc.card.price)}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ))}
      </div>
    </Layout>
  );
}
