// Parses decklists pasted from the common export formats into
// [{ section, count, name, set_code, number }]. Handles:
//   MTG Arena / MTGO:   "4 Lightning Bolt (M11) 146", "4 Lightning Bolt", "Sideboard" header,
//                       or MTGO .txt where a blank line separates main from sideboard
//   Pokémon TCG Live:   "Pokémon: 12" header, "4 Arven SVI 166", "* 4 Arven SVI 166"
//   One Piece / Bandai: "4xOP01-016", "1 OP05-119"   (card id is used as the name)
//   Generic:            "4x Name", "Name x4"
// Lines that look like totals or comments are ignored.

const SECTION_RE =
  /^(pok[eé]mon|trainers?|energy|energies|deck|main\s*deck|main|maindeck|sideboard|side\s*deck|side|extra\s*deck|extra|leader|commander|companion|maybeboard|don!?!?(\s*deck)?|characters?|events?|stages?|songs?|items?|locations?|actions?|monsters?|spells?|traps?)\s*[:\-]?\s*(\(?\d+\)?)?\s*:?$/i;

const SECTION_ALIASES = {
  pokemon: "pokemon", "pokémon": "pokemon", trainer: "trainer", trainers: "trainer",
  energy: "energy", energies: "energy",
  deck: "main", main: "main", maindeck: "main", "main deck": "main",
  sideboard: "sideboard", side: "sideboard", "side deck": "sideboard",
  extra: "extra", "extra deck": "extra",
  leader: "leader", commander: "commander", companion: "companion", maybeboard: "maybeboard",
};

function sectionName(raw) {
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  return SECTION_ALIASES[key] || key.replace(/[^a-z0-9 ]/g, "").trim() || "main";
}

// "OP01-016", "ST10-005", "EB01-001", "P-001", "FB01-001", "GD01-001"
const CARD_ID_RE = /^[A-Z]{1,4}\d{0,3}-\d{2,4}[A-Z]?$/;

function parseCardLine(line) {
  let m;
  // "4xOP01-016" / "4 OP01-016" / "4x OP01-016"
  if ((m = line.match(/^(\d+)\s*[xX]?\s*([A-Z]{1,4}\d{0,3}-\d{2,4}[A-Z]?)$/)) && CARD_ID_RE.test(m[2])) {
    return { count: +m[1], name: m[2], set_code: m[2].split("-")[0], number: m[2] };
  }
  // count first: "4 Name", "4x Name", "4 Name (SET) 123", "4 Name SET 123"
  if ((m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/))) return { count: +m[1], ...parseNamePart(m[2]) };
  // count last: "Name x4"
  if ((m = line.match(/^(.+?)\s+[xX]\s*(\d+)$/))) return { count: +m[2], ...parseNamePart(m[1]) };
  return null;
}

function parseNamePart(s) {
  s = s.trim();
  let m;
  // MTG Arena: "Name (SET) 123" — number may contain letters/stars (e.g. 123a, 12★)
  if ((m = s.match(/^(.+?)\s+\(([A-Za-z0-9]{2,6})\)\s*([^\s]+)?(\s+\*F\*)?$/))) {
    return { name: m[1].trim(), set_code: m[2].toUpperCase(), number: m[3] || "" };
  }
  // PTCG Live: "Name SET 123" where SET is 2–5 uppercase letters/digits, e.g. "SVI 166", "PR-SV 45"
  if ((m = s.match(/^(.+?)\s+([A-Z][A-Z0-9]{1,4}(?:-[A-Z0-9]{1,4})?)\s+(\d+[a-zA-Z]?)$/))) {
    return { name: m[1].trim(), set_code: m[2], number: m[3] };
  }
  return { name: s, set_code: "", number: "" };
}

export function parseDecklist(text, { game } = {}) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [];
  let section = "main";
  let sawHeader = false;
  let sawCard = false;
  let blankAfterCards = false;

  for (const rawLine of lines) {
    let line = rawLine.replace(/^[\s*•\-]+(?=\d)/, "").trim();
    if (!line) {
      if (sawCard) blankAfterCards = true;
      continue;
    }
    if (/^(#|\/\/)/.test(line)) continue;
    if (/^total\s*(cards)?\s*[:\-]?\s*\d+$/i.test(line)) continue;
    // Arena "About / Name xyz" preamble
    if (/^(about|name\s)/i.test(line)) continue;

    const header = line.match(SECTION_RE);
    if (header && !/^\d/.test(line)) {
      section = sectionName(header[1]);
      sawHeader = true;
      blankAfterCards = false;
      continue;
    }

    const card = parseCardLine(line);
    if (!card || !card.name || !(card.count > 0)) continue;

    // MTGO .txt export: main deck, blank line, sideboard — no headers.
    if (game === "mtg" && blankAfterCards && !sawHeader && section === "main") section = "sideboard";
    blankAfterCards = false;
    sawCard = true;

    out.push({ section, ...card });
  }
  return mergeDuplicates(out);
}

export function mergeDuplicates(cards) {
  const map = new Map();
  for (const c of cards) {
    const key = [c.section, c.name.toLowerCase(), c.set_code || "", c.number || ""].join("|");
    if (map.has(key)) map.get(key).count += c.count;
    else map.set(key, { ...c });
  }
  return [...map.values()];
}

export function formatDecklist(cards) {
  const bySection = new Map();
  for (const c of cards) {
    if (!bySection.has(c.section)) bySection.set(c.section, []);
    bySection.get(c.section).push(c);
  }
  const blocks = [];
  for (const [section, list] of bySection) {
    const total = list.reduce((s, c) => s + c.count, 0);
    const lines = list.map(c => `${c.count} ${c.name}${c.set_code && c.number && c.number !== c.name ? ` ${c.set_code} ${c.number}` : ""}`);
    blocks.push(`${section[0].toUpperCase()}${section.slice(1)}: ${total}\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

export const deckSize = (cards, section) =>
  cards.filter(c => !section || c.section === section).reduce((s, c) => s + c.count, 0);
