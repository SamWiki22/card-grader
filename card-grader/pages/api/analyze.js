import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { base64, prompt } = req.body;
  if (!base64 || !prompt) return res.status(400).json({ error: "Missing base64 or prompt" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
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
    const detail = err?.message || err?.error?.message || JSON.stringify(err) || "Unknown error";
    res.status(500).json({ error: detail });
  }
}
