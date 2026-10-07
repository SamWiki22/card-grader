// What a customer can do with a deck right now: buy a built copy, pre-order one, or nothing.
// Shared by the storefront and /api/checkout so both apply the same caps.
export const MAX_PER_ORDER = 10;

export function deckAvailability(deck, openPreorders = 0) {
  if (deck.quantity > 0) return { mode: "stock", max: Math.min(deck.quantity, MAX_PER_ORDER) };
  if (deck.preorder_enabled) {
    const left = deck.preorder_limit == null ? MAX_PER_ORDER : Math.max(0, deck.preorder_limit - openPreorders);
    if (left > 0) return { mode: "preorder", max: Math.min(left, MAX_PER_ORDER) };
  }
  return { mode: "soldout", max: 0 };
}

// Decks featuring a set released in the last `days` (or not yet released) get a "New set" badge.
export function isNewSet(deck, days = 60, now = new Date()) {
  if (!deck.set_release_date) return false;
  const released = new Date(`${deck.set_release_date}T00:00:00`);
  return now - released < days * 86400000;
}

export const isUpcoming = (deck, now = new Date()) =>
  !!deck.set_release_date && new Date(`${deck.set_release_date}T00:00:00`) > now;

// Newest featured set first, then most recently updated.
export const byNewestSet = (a, b) =>
  (b.set_release_date || "").localeCompare(a.set_release_date || "") || (b.updated_at || "").localeCompare(a.updated_at || "");
