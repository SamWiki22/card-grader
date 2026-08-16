import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

const GAME_IDS = ["pokemon", "mtg", "onepiece", "dbs", "gundam", "unionarena", "other"];
const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64 } = req.body;
  if (!base64) return res.status(400).json({ error: "Missing base64" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ aiAvailable: false });
  }

  const prompt = `You are helping a trading card shop clerk quickly add a new item to inventory by photographing it. The photo shows a sealed box, a sealed pack, or a single trading card.

Identify:
- "type": "box" (sealed booster box, ETB, tin, starter deck, bundle, etc.), "pack" (a single loose booster pack), or "single" (an individual trading card).
- "game": one of ${JSON.stringify(GAME_IDS)} — "pokemon", "mtg" (Magic: The Gathering), "onepiece" (One Piece), "dbs" (Dragon Ball), "gundam", "unionarena" (Union Arena), or "other" if it's a different game or you can't tell.
- "name": the product or card name. For a single card, include the character/card name, rarity marker (e.g. SR, R, holo, foil — use "*" for alternate-art/parallel prints if visible), and the card number/set code if visible on the card, e.g. "Charizard SR* SB02-058". For a box/pack, the product name, e.g. "Scarlet & Violet Booster Box".
- "set": the set or expansion name, as printed or as you can best identify it.
- "condition": ONLY for type "single" — your best visual guess at physical condition from the photo: "NM" (near mint, no visible wear), "LP" (light play, minor edge/corner wear), "MP" (moderate play), "HP" (heavy play), or "DMG" (damaged/creased/torn). Leave "" if you can't judge from the photo. Leave "" entirely for type "box" or "pack" (sealed product doesn't need a condition grade).
- "notes": anything else useful — e.g. "Foil", "1st edition", visible flaws, or if you're unsure of the exact card. Do NOT guess or state a market price or dollar value anywhere in your response — pricing is up to the shop owner.
- "confidence": 0.0-1.0, how confident you are in this identification overall.

Respond with ONLY a JSON object: {"type":"...","game":"...","name":"...","set":"...","condition":"...","notes":"...","confidence":0.0}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: prompt },
        ],
      }],
    });
    const text = message.content[0]?.text || "";
    const f = text.indexOf("{"), l = text.lastIndexOf("}");
    let result = null;
    if (f !== -1 && l > f) {
      try { result = JSON.parse(text.slice(f, l + 1)); } catch (_) {}
    }
    if (!result) return res.json({ aiAvailable: true, confidence: 0 });

    const type = ["box", "pack", "single"].includes(result.type) ? result.type : "single";
    const game = GAME_IDS.includes(result.game) ? result.game : "other";
    const condition = type === "single" && CONDITIONS.includes(result.condition) ? result.condition : "";

    res.json({
      aiAvailable: true,
      type, game, condition,
      name: String(result.name || "").slice(0, 120),
      set: String(result.set || "").slice(0, 120),
      notes: String(result.notes || "").slice(0, 300),
      confidence: typeof result.confidence === "number" ? result.confidence : 0,
    });
  } catch (err) {
    const detail = err?.message || err?.error?.message || "Unknown error";
    res.status(500).json({ error: detail, aiAvailable: true });
  }
}
