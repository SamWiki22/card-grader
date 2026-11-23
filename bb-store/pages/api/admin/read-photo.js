import { requireStaff } from "../../../lib/auth";
import { db, selectAll } from "../../../lib/catalog";
import { aiReady, readPhoto, matchInventory } from "../../../lib/ai";
import { matchCard } from "../../../lib/numbers";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// Staff + admins: read cards from a photo. mode "add" → fields for the add form;
// mode "sold" → items plus their best inventory matches, for recording sales.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const staff = await requireStaff(req, res);
  if (!staff) return;
  if (!aiReady()) return res.status(501).json({ error: "Photo reading isn’t set up yet — add ANTHROPIC_API_KEY in Vercel." });
  const mode = req.body?.mode === "sold" ? "sold" : "add";
  let items;
  try {
    items = await readPhoto(String(req.body?.image || ""), mode);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: e.message === "Unsupported image" ? "That file isn’t a photo we can read." : "Couldn’t read that photo — try a clearer one." });
  }
  // Bulk add: also look each single up on TCGplayer (rarity, market price, product link).
  if (mode === "add" && req.body?.match) {
    const matched = await Promise.all(items.map(it => (it.type === "single" ? matchCard(it).catch(() => null) : null)));
    return res.json({ items: items.map((it, i) => ({ ...it, tcg: matched[i] })) });
  }
  if (mode === "add") return res.json({ items });

  const { data: inventory, error } = await selectAll(() => db.from("items").select("id,type,game,owner,name,set_name,sku,condition,quantity,price").gt("quantity", 0).order("id"));
  if (error) { console.error(error); return res.status(500).json({ error: "Couldn’t load inventory." }); }
  res.json({ matches: matchInventory(items, inventory) });
}
