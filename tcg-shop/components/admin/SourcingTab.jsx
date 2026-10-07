import { useEffect, useMemo, useState } from "react";
import { supabase, fetchAll } from "../../lib/supabaseClient";
import { gameLabel, GAME_MAP } from "../../lib/games";
import { sourcingPlan, massEntryList, idList } from "../../lib/sourcing";
import { money } from "../../lib/pricing";

const TIERS = [
  ["bulk", "Bulk / cheap", "Commons and uncommons: buy these in lots, from bulk bins or TCGplayer Mass Entry."],
  ["staple", "Staples", "The pricier cards. Shop around, trade-ins, buylist."],
  ["unknown", "Not stocked yet", "No price on file (new set / never stocked). Check market price before buying."],
];

// What the shop owes (paid pre-orders) + what it wants on the shelf (target stock), turned into
// one pooled shopping list across every deck.
export default function SourcingTab({ onOpenDeck }) {
  const [decks, setDecks] = useState(null);
  const [owed, setOwed] = useState({});
  const [pending, setPending] = useState({});
  const [bulkUnder, setBulkUnder] = useState(1);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [d, items] = await Promise.all([
          fetchAll(() => supabase.from("decks").select("id,name,game,quantity,target_stock,preorder_eta,deck_cards(count,name,set_code,number,card:cards(id,price,quantity))").order("id")),
          fetchAll(() =>
            supabase.from("order_items").select("ref_id,quantity,orders!inner(status)")
              .eq("kind", "deck").eq("preorder", true).eq("allocated", false).neq("orders.status", "cancelled").order("id"),
          ),
        ]);
        const paid = {}, unpaid = {};
        for (const it of items) {
          const bucket = it.orders.status === "pending_payment" ? unpaid : paid;
          bucket[it.ref_id] = (bucket[it.ref_id] || 0) + it.quantity;
        }
        setDecks(d); setOwed(paid); setPending(unpaid);
      } catch (e) { setError(e.message); }
    })();
  }, []);

  const { plan, rows } = useMemo(() => (decks ? sourcingPlan(decks, owed, { bulkUnder }) : { plan: [], rows: [] }), [decks, owed, bulkUnder]);
  const games = [...new Set(rows.map(r => r.game))];

  const copy = async (key, text) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  if (error) return <p className="error">{error}</p>;
  if (!decks) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <div className="card stack">
        <h3 style={{ margin: 0 }}>Build queue</h3>
        <p className="small muted">Copies to build = paid pre-orders + &ldquo;keep on shelf&rdquo; target − built copies already on the shelf. Set targets on each deck.</p>
        {plan.length === 0 ? <p className="muted">Nothing to build: no open pre-orders or shelf targets.</p> : (
          <div className="scroll-x"><table>
            <thead><tr><th>Deck</th><th>Pre-orders paid</th><th>Awaiting payment</th><th>Shelf target</th><th>On shelf</th><th>To build</th></tr></thead>
            <tbody>
              {plan.map(p => (
                <tr key={p.deck.id} style={{ cursor: "pointer" }} onClick={() => onOpenDeck(p.deck.id)}>
                  <td><strong>{p.deck.name}</strong><div className="small muted">{gameLabel(p.deck.game)}{p.deck.preorder_eta ? ` · ships ${p.deck.preorder_eta}` : ""}</div></td>
                  <td>{p.owed}</td>
                  <td className="muted">{pending[p.deck.id] || 0}</td>
                  <td>{p.deck.target_stock}</td>
                  <td>{p.deck.quantity}</td>
                  <td>{p.copies > 0 ? <span className="badge warn">{p.copies}</span> : <span className="badge ok">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card stack">
        <div className="spread">
          <h3 style={{ margin: 0 }}>Shopping list ({rows.reduce((s, r) => s + r.short, 0)} cards)</h3>
          <div className="row small">
            <label style={{ margin: 0 }}>Bulk = under</label>
            <input type="number" step="0.25" min="0" value={bulkUnder} onChange={e => setBulkUnder(Number(e.target.value) || 0)} style={{ width: 80 }} />
            <a href="https://www.tcgplayer.com/massentry" target="_blank" rel="noreferrer">TCGplayer Mass Entry ↗</a>
          </div>
        </div>
        <p className="small muted">Pooled across every deck in the queue, minus singles you already have. <em>Copy names</em> pastes into TCGplayer Mass Entry so its optimizer picks the cheapest printing. For card-number games (One Piece, Gundam, Fusion World, Union Arena), many cards share a name, so use <em>Copy with card #</em> to buy the exact card. Then bulk-add what arrives on the Singles Inventory tab.</p>
        {rows.length === 0 && <p className="muted">You have every single you need. Go build!</p>}
        {games.map(game => TIERS.map(([tier, label, hint]) => {
          const list = rows.filter(r => r.game === game && r.tier === tier);
          if (!list.length) return null;
          const key = `${game}-${tier}`;
          return (
            <div key={key} className="stack">
              <div className="spread">
                <div><strong>{gameLabel(game)}: {label}</strong> <span className="small muted">({list.reduce((s, r) => s + r.short, 0)} cards) {hint}</span></div>
                <div className="row">
                  {GAME_MAP[game]?.idDecklists && (
                    <button className="btn small" onClick={() => copy(`${key}-id`, idList(list))}>{copied === `${key}-id` ? "Copied!" : "Copy with card #"}</button>
                  )}
                  <button className="btn small" onClick={() => copy(key, massEntryList(list))}>{copied === key ? "Copied!" : "Copy names"}</button>
                </div>
              </div>
              <div className="scroll-x"><table>
                <thead><tr><th>Buy</th><th>Card</th><th>Need</th><th>Have</th><th>Your price</th><th>For decks</th></tr></thead>
                <tbody>
                  {list.map(r => (
                    <tr key={`${r.name}|${r.number}`}>
                      <td><strong>{r.short}</strong></td>
                      <td>{r.name} <span className="small muted">{r.set_code} {r.number !== r.name ? r.number : ""}</span></td>
                      <td>{r.need}</td><td>{r.have}</td><td>{money(r.price)}</td>
                      <td className="small muted">{r.decks.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          );
        }))}
      </div>
    </div>
  );
}
