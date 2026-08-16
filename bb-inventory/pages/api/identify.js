import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_REFERENCE_PHOTOS = 40;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
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
  const withPhotos = catalog.filter(c => c.photo).slice(0, MAX_REFERENCE_PHOTOS);

  const content = [
    { type: "text", text: "Here is a photo of an item about to be sold at a trading card shop (a sealed box, a sealed pack, or a single card):" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
  ];

  if (withPhotos.length > 0) {
    content.push({ type: "text", text: "Below are reference photos of some catalog items, each labeled with its catalog id, for direct visual comparison against the photo above:" });
    for (const c of withPhotos) {
      content.push({ type: "text", text: `Catalog id "${c.id}" — ${c.name} (${c.set}):` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: c.photo } });
    }
  }

  const prompt = `Full shop catalog (JSON array of id/name/set/type — only some of these have a reference photo above; use name/set/type reasoning for the rest):
${catalogText}

Decide which catalog item(s) the first photo most likely matches. Prioritize direct visual comparison against any reference photos shown above; otherwise use box/pack art style, card name or character art, and any visible text or set symbols. Respond with ONLY a JSON object: {"matches":[{"id":"<catalog id>","confidence":0.0-1.0,"reason":"short reason"}]}, at most 5 items, most confident first. If nothing matches with reasonable confidence, respond {"matches":[]}.`;
  content.push({ type: "text", text: prompt });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content }],
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
