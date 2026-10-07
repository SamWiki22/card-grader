import Link from "next/link";
import { gameLabel } from "../lib/games";
import { deckPricing, money } from "../lib/pricing";

export function sourceLine(deck) {
  return [deck.source_placing, deck.source_player, deck.source_event].filter(Boolean).join(" · ");
}

export default function DeckTile({ deck }) {
  const { price, savings } = deckPricing(deck, deck.deck_cards || []);
  const source = sourceLine(deck);
  return (
    <Link href={`/decks/${deck.id}`} className="card link">
      {deck.image_url && <img className="thumb" src={deck.image_url} alt="" />}
      <div className="small muted">{gameLabel(deck.game)}{deck.format ? ` · ${deck.format}` : ""}</div>
      <h3 style={{ margin: "4px 0 6px" }}>{deck.name}</h3>
      {source && <div className="small muted" style={{ marginBottom: 8 }}>🏆 {source}</div>}
      <div className="spread">
        <span className="price">{money(price)}</span>
        {deck.quantity > 0 ? <span className="badge ok">In stock</span> : <span className="badge bad">Sold out</span>}
      </div>
      {savings > 0 && <div className="small muted">Save {money(savings)} vs. singles</div>}
    </Link>
  );
}
