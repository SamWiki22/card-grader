// Server-only: read trading cards / sealed product out of a photo with Claude.
// Needs ANTHROPIC_API_KEY. Used by "Snap to add" and "Record sales from a photo".
import Anthropic from "@anthropic-ai/sdk";

export const aiReady = () => !!process.env.ANTHROPIC_API_KEY;

const GAMES = ["pokemon", "mtg", "dbs", "onepiece", "gundam", "unionarena", "riftbound", "other"];
const str = { type: "string" };

// Every field is required (structured outputs); the model uses "" when it can't tell.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["game", "type", "name", "set", "number", "condition", "quantity", "price", "foil", "notes"],
        properties: {
          game: { type: "string", enum: GAMES },
          type: { type: "string", enum: ["single", "box", "pack"] },
          name: str, set: str, number: str, condition: str,
          quantity: { type: "integer" },
          price: str,
          foil: { type: "boolean" },
          notes: str,
        },
      },
    },
  },
};

const FIELDS = `For each item give:
- game: ${GAMES.join(", ")} ("mtg" = Magic: The Gathering, "dbs" = Dragon Ball Super / Fusion World, "other" if unsure)
- type: "single" (one card), "box" (booster box, ETB, bundle, tin, deck, case) or "pack" (one loose booster pack)
- name: the card or product name as printed, with any variant words (e.g. "Alternate Art", "SCR", "Showcase")
- set: the set or expansion name if you can read or identify it, else ""
- number: the collector number / card code as printed (e.g. "223/197", "FB01-001", "OP05-119"), else ""
- condition: for a graded slab, the grader and grade (e.g. "PSA 10"); otherwise "" — don't guess raw condition
- quantity: how many of this item (default 1)
- price: a dollar amount only if one is written in the image (price sticker, or a message like "sold for $60"), digits only like "60.00", else ""
- foil: true only if the card clearly has a foil / holo / rainbow finish across the card, else false
- notes: anything useful (signed, 1st edition, what a message said), else ""`;

const PROMPTS = {
  add: `This photo shows an item a trading card shop is adding to inventory: usually one card (raw or in a graded slab) or one sealed product.
List the item (or each distinct item if there are several).
${FIELDS}`,
  sold: `This image is from a trading card shop's staff group chat about items that SOLD. It may be a photo of the cards/products, a screenshot of messages describing sales, or both.
List every distinct item that was sold. If the messages give a sale price for an item, put it in price. Don't list items that weren't sold.
${FIELDS}`,
};

export async function readPhoto(dataUrl, mode = "add") {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/s.exec(dataUrl || "");
  if (!m) throw new Error("Unsupported image");
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    // If the model declines, the API retries on a fallback model automatically.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text: PROMPTS[mode] || PROMPTS.add },
      ],
    }],
  });
  if (response.stop_reason === "refusal") throw new Error("The photo couldn’t be read.");
  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("The photo couldn’t be read."); }
  return (parsed.items || []).map(it => ({
    game: GAMES.includes(it.game) ? it.game : "other",
    type: ["single", "box", "pack"].includes(it.type) ? it.type : "single",
    name: String(it.name || "").slice(0, 160),
    set: String(it.set || "").slice(0, 160),
    number: String(it.number || "").slice(0, 40),
    condition: String(it.condition || "").slice(0, 40),
    quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    price: Number(String(it.price || "").replace(/[^0-9.]/g, "")) || null,
    foil: !!it.foil,
    notes: String(it.notes || "").slice(0, 300),
  }));
}

// ── Match items read from a photo to inventory rows ──────────────────────
// Words too common to tell cards apart ("Charizard ex" vs "Alakazam ex").
const STOP = new Set("ex gx v vmax vstar mega tag team the of and a an alt art alternate full holo foil reverse rare secret sr scr sar ur ar ir sir special illustration promo card set booster pack box edition 1st first nm lp mp hp psa bgs cgc".split(" "));
const words = s => String(s || "").toLowerCase().replace(/[^a-z0-9/\-]+/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));

export function matchInventory(found, inventory, max = 5) {
  return found.map(f => {
    const nameW = new Set(words(f.name));
    const setW = new Set(words(f.set));
    const num = f.number.toLowerCase();
    const scored = inventory.map(it => {
      const iw = words(`${it.name} ${it.sku || ""}`);
      const overlap = iw.filter(w => nameW.has(w)).length;
      const nameScore = nameW.size ? overlap / Math.max(nameW.size, 1) : 0;
      const setScore = setW.size ? words(it.set_name).filter(w => setW.has(w)).length / setW.size : 0;
      const numHit = num && `${it.name} ${it.sku || ""}`.toLowerCase().includes(num) ? 1 : 0;
      const score = nameScore * 4 + numHit * 5 + setScore + (it.game === f.game ? 0.5 : 0) + (it.type === f.type ? 0.3 : 0);
      return { id: it.id, name: it.name, set_name: it.set_name, condition: it.condition, quantity: it.quantity, price: Number(it.price), owner: it.owner, score, strong: numHit === 1 || nameScore >= 0.6 };
    }).filter(c => c.score >= 1.5).sort((a, b) => b.score - a.score).slice(0, max);
    // Only pre-select a match when it's clearly the same card; otherwise a person picks.
    return { found: f, candidates: scored, confident: !!scored[0]?.strong && (!scored[1] || scored[0].score - scored[1].score >= 1 || scored[1].strong === false) };
  });
}
