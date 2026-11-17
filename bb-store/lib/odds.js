// Pool odds math. No server imports, so the admin page can run it in the browser
// for live previews and the API can run the exact same code when saving.

// Value bands relative to the pack price, like "most pulls land near the price,
// a few hit big". Labels use the real min/max of the cards in each band.
const BAND_EDGES = [0, 0.6, 1.2, 3, 10, Infinity];

export function oddsFor(cards, priceCents) {
  const total = cards.reduce((s, c) => s + Number(c.weight), 0);
  if (!total) return [];
  const bands = BAND_EDGES.slice(0, -1).map((lo, i) => ({ lo: lo * priceCents, hi: BAND_EDGES[i + 1] * priceCents, cards: [] }));
  for (const c of cards) bands.find(b => c.market_value_cents >= b.lo && c.market_value_cents < b.hi).cards.push(c);
  return bands.map((b, band) => ({ ...b, band })).filter(b => b.cards.length).map(b => {
    const values = b.cards.map(c => c.market_value_cents);
    return {
      band: b.band,                    // 0 = cheapest range … 4 = chase range
      minCents: Math.min(...values),
      maxCents: Math.max(...values),
      count: b.cards.length,
      chance: b.cards.reduce((s, c) => s + Number(c.weight), 0) / total,
    };
  });
}

// Expected value per opening, for the admin margin check.
export function expectedValue(cards) {
  const total = cards.reduce((s, c) => s + Number(c.weight), 0);
  return total ? cards.reduce((s, c) => s + Number(c.weight) * c.market_value_cents, 0) / total : 0;
}

export const DEFAULT_TARGET_MARGIN = 0.15;
const MIN_WEIGHT = 0.0001;
const MAX_STEEPNESS = 200;

// Weights are stored with 3 significant figures so they stay readable in the pool table.
function roundWeight(w) {
  if (!(w > MIN_WEIGHT)) return MIN_WEIGHT;
  const p = Math.pow(10, 2 - Math.floor(Math.log10(w)));
  return Math.round(w * p) / p;
}

// Balance a pool so its expected pull value ≈ (1 − margin) × pack price.
// Cards worth ≤ the pack price go to weight 1. A card worth more gets
// weight (price ÷ value)^k, one k for the whole pool, so a card worth 10× the
// price is cut far more than one worth 2×. k is found by bisection (the
// expected value only falls as k grows).
//
// `cards` should be the pool's available cards. Returns:
//   status: "ok" | "empty" | "no-hits" (nothing above the price to scale)
//           | "already-under" (target met with every card at weight 1)
//           | "unreachable" (even with hits near zero the cheap cards are worth too much)
//   weights: { [card id]: new weight }, evCents, margin, targetCents, steepness
export function balanceWeights(cards, priceCents, targetMargin = DEFAULT_TARGET_MARGIN) {
  const price = Number(priceCents);
  const targetCents = (1 - targetMargin) * price;
  const weightsAt = (k, round) => {
    const out = {};
    for (const c of cards) {
      const v = Number(c.market_value_cents);
      out[c.id] = v <= price ? 1 : (round ? roundWeight : w => Math.max(MIN_WEIGHT, w))(Math.pow(price / v, k));
    }
    return out;
  };
  const evOf = w => expectedValue(cards.map(c => ({ market_value_cents: Number(c.market_value_cents), weight: w[c.id] })));
  const result = (status, k) => {
    const weights = weightsAt(k, true);
    const evCents = evOf(weights);
    return { status, steepness: k, weights, evCents, margin: price ? 1 - evCents / price : null, targetCents };
  };

  if (!cards.length || !(price > 0)) return { status: "empty", steepness: 0, weights: {}, evCents: 0, margin: null, targetCents };
  if (!cards.some(c => Number(c.market_value_cents) > price)) return result("no-hits", 0);
  if (evOf(weightsAt(0, false)) <= targetCents) return result("already-under", 0);
  if (evOf(weightsAt(MAX_STEEPNESS, false)) > targetCents) return result("unreachable", MAX_STEEPNESS);

  let lo = 0, hi = MAX_STEEPNESS;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (evOf(weightsAt(mid, false)) > targetCents) lo = mid; else hi = mid;
  }
  return result("ok", hi);
}
