import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, catalog } = req.body;
  if (!base64 || !Array.isArray(catalog)) return res.status(400).json({ error: "Missing base64 or catalog" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({ matches: [], aiAvailable: false });
  }

  const catalogText = JSON.stringify(catalog.map(c => ({ id: c.id, name: c.name, set: c.set, type: c.type })));
  const prompt = `You are helping a trading card shop clerk log a sale by photo. The photo shows an item (a sealed box, a sealed pack, or a single card) that is about to be sold.

Shop catalog (JSON array of id/name/set/type):
${catalogText}

Look at the photo and decide which catalog item(s) it most likely matches, using box/pack art, card name or character art, and any visible text or set symbols. Respond with ONLY a JSON object: {"matches":[{"id":"<catalog id>","confidence":0.0-1.0,"reason":"short reason"}]}, at most 5 items, most confident first. If nothing matches with reasonable confidence, respond {"matches":[]}.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
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
    let matches = [];
    if (f !== -1 && l > f) {
      try {
        const parsed = JSON.parse(text.slice(f, l + 1));
        if (Array.isArray(parsed.matches)) matches = parsed.matches.filter(m => m && m.id);
      } catch (_) {}
    }
    res.json({ matches, aiAvailable: true });
  } catch (err) {
    const detail = err?.message || err?.error?.message || "Unknown error";
    res.status(500).json({ error: detail, matches: [] });
  }
}
