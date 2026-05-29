import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, prompt } = req.body;
  if (!base64 || !prompt) return res.status(400).json({ error: "Missing base64 or prompt" });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: prompt },
        ],
      }],
    });
    res.json({ text: message.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
}
