// Links decklist entries to singles-inventory rows so decks can be priced and built.
// Preference: exact name+set+number > set+number > name (in-stock, then most stock).

export function normName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const normCode = s => String(s || "").trim().toUpperCase();

export function buildIndex(inventory) {
  const byName = new Map();
  const bySetNum = new Map();
  const byNumber = new Map();
  for (const card of inventory) {
    const n = normName(card.name);
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(card);
    if (card.set_code && card.number) {
      const k = `${normCode(card.set_code)}|${normCode(card.number)}`;
      if (!bySetNum.has(k)) bySetNum.set(k, []);
      bySetNum.get(k).push(card);
    }
    if (card.number) {
      const k = normCode(card.number);
      if (!byNumber.has(k)) byNumber.set(k, []);
      byNumber.get(k).push(card);
    }
  }
  return { byName, bySetNum, byNumber };
}

const best = list =>
  [...list].sort((a, b) => (b.quantity > 0) - (a.quantity > 0) || b.quantity - a.quantity || a.price - b.price)[0];

export function matchCard(entry, index) {
  const n = normName(entry.name);
  if (entry.set_code && entry.number) {
    const k = `${normCode(entry.set_code)}|${normCode(entry.number)}`;
    const setNum = index.bySetNum.get(k) || [];
    const exact = setNum.filter(c => normName(c.name) === n);
    if (exact.length) return best(exact);
    if (setNum.length) return best(setNum);
  }
  const byName = index.byName.get(n);
  if (byName?.length) return best(byName);
  // One Piece / Bandai lists use the card id ("OP01-016") as the name; inventory stores it as number.
  const byId = index.byNumber.get(normCode(entry.number || entry.name));
  if (byId?.length && /-/.test(entry.number || entry.name)) return best(byId);
  return null;
}

export function matchDeck(entries, inventory) {
  const index = buildIndex(inventory);
  return entries.map(e => ({ ...e, card_id: matchCard(e, index)?.id || null }));
}
