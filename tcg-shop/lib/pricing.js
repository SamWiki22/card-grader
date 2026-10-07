// Shared by the storefront and the checkout API so the price a buyer sees is the price they pay.
// `deckCards` rows carry `card` = the linked inventory row ({ id, price, quantity }) or null.

export const round2 = n => Math.round(n * 100) / 100;

export function deckPricing(deck, deckCards) {
  let singlesTotal = 0;
  let complete = deckCards.length > 0;
  for (const dc of deckCards) {
    if (!dc.card) complete = false;
    else singlesTotal += dc.count * Number(dc.card.price || 0);
  }
  singlesTotal = round2(singlesTotal);
  let price = null;
  if (deck.price != null) price = Number(deck.price);
  else if (complete) price = round2(singlesTotal * (1 - Number(deck.discount_pct || 0) / 100));
  return { price, singlesTotal, complete, savings: price != null && complete ? round2(singlesTotal - price) : 0 };
}

// How many more copies could be assembled from singles on hand.
export function buildableCopies(deckCards) {
  if (!deckCards.length) return 0;
  const need = new Map();
  for (const dc of deckCards) {
    if (!dc.card) return 0;
    need.set(dc.card.id, { have: dc.card.quantity, need: (need.get(dc.card.id)?.need || 0) + dc.count });
  }
  let copies = Infinity;
  for (const { have, need: n } of need.values()) copies = Math.min(copies, Math.floor(have / n));
  return copies === Infinity ? 0 : copies;
}

// Per-card shortfall for building `copies` copies — the "what do I still need to buy" list.
export function shortfall(deckCards, copies = 1) {
  const used = new Map();
  return deckCards.map(dc => {
    const need = dc.count * copies;
    if (!dc.card) return { ...dc, need, have: 0, short: need };
    const already = used.get(dc.card.id) || 0;
    const have = Math.max(0, dc.card.quantity - already);
    used.set(dc.card.id, already + need);
    return { ...dc, need, have: Math.min(have, need), short: Math.max(0, need - have) };
  });
}

export const money = n => (n == null ? "—" : `$${Number(n).toFixed(2)}`);
