import Link from "next/link";
import { gameLabel } from "../lib/games";
import { deckPricing, money } from "../lib/pricing";
import { deckAvailability, isNewSet, isUpcoming } from "../lib/preorder";

export function sourceLine(deck) {
  return [deck.source_placing, deck.source_player, deck.source_event].filter(Boolean).join(" · ");
}

export function AvailabilityBadge({ deck, openPreorders }) {
  const { mode } = deckAvailability(deck, openPreorders);
  if (mode === "stock") return <span className="badge ok">In stock</span>;
  if (mode === "preorder") return <span className="badge warn">Pre-order{deck.preorder_eta ? ` · ships ${deck.preorder_eta}` : ""}</span>;
  return <span className="badge bad">Sold out</span>;
}

export function SetBadge({ deck }) {
  if (!deck.featured_set) return null;
  if (isUpcoming(deck)) return <span className="badge new">Upcoming: {deck.featured_set}</span>;
  if (isNewSet(deck)) return <span className="badge new">New: {deck.featured_set}</span>;
  return <span className="badge">{deck.featured_set}</span>;
}

export default function DeckTile({ deck, openPreorders = 0 }) {
  const { price, savings } = deckPricing(deck, deck.deck_cards || []);
  const source = sourceLine(deck);
  return (
    <Link href={`/decks/${deck.id}`} className="card link">
      {deck.image_url && <img className="thumb" src={deck.image_url} alt="" />}
      <div className="spread small muted">
        <span>{gameLabel(deck.game)}{deck.format ? ` · ${deck.format}` : ""}</span>
        <SetBadge deck={deck} />
      </div>
      <h3 style={{ margin: "4px 0 6px" }}>{deck.name}</h3>
      {source && <div className="small muted" style={{ marginBottom: 8 }}>🏆 {source}</div>}
      <div className="spread">
        <span className="price">{money(price)}</span>
        <AvailabilityBadge deck={deck} openPreorders={openPreorders} />
      </div>
      {savings > 0 && <div className="small muted">Save {money(savings)} vs. singles</div>}
    </Link>
  );
}
