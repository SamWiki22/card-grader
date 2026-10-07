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

// Card ids like "OP01-016" / "UE01BT/JJK-1-001" / "OGN-066" identify one card across printings.
const looksLikeId = s => /^[A-Z][A-Z0-9/]*-\d/.test(normCode(s));

export function matchCard(entry, index) {
  const n = normName(entry.name);
  if (entry.set_code && entry.number) {
    const k = `${normCode(entry.set_code)}|${normCode(entry.number)}`;
    const setNum = index.bySetNum.get(k) || [];
    const exact = setNum.filter(c => normName(c.name) === n);
    if (exact.length) return best(exact);
    if (setNum.length) return best(setNum);
  }
  // Id-based games (One Piece, Gundam, Fusion World, Union Arena, Riftbound): the id beats the name,
  // because the same name can be several different cards (e.g. a dozen "Monkey.D.Luffy").
  for (const id of [entry.number, entry.name]) {
    if (id && looksLikeId(id)) {
      const hit = index.byNumber.get(normCode(id));
      if (hit?.length) return best(hit);
    }
  }
  const byName = index.byName.get(n);
  if (byName?.length) return best(byName);
  return null;
}

export function matchDeck(entries, inventory) {
  const index = buildIndex(inventory);
  return entries.map(e => {
    const card = matchCard(e, index);
    // Id-only lists ("4xOP01-016") read badly on the store; show the linked card's real name.
    const name = card && looksLikeId(e.name) && normCode(e.name) === normCode(e.number || e.name) ? card.name : e.name;
    return { ...e, name, card_id: card?.id || null };
  });
}
