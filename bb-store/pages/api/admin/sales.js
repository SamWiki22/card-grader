import { requireAdmin } from "../../../lib/auth";
import { db, selectAll } from "../../../lib/catalog";

const COLS = "id,item_id,item_name,item_set,item_type,owner,item_cost,quantity,price,total,sold_by,created_at";

// Admins: sales history for the Sales page.
//   GET ?from=ISO&to=ISO     → sales in that window (no photos)
//   GET ?photo=<sale id>     → that sale's photo
//   POST { action: "void", id } → delete the sale and put the stock back
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET" && req.query.photo) {
    const { data } = await db.from("sales").select("thumbnail").eq("id", String(req.query.photo)).maybeSingle();
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(data?.thumbnail || "");
    if (!m) return res.status(404).end();
    res.setHeader("Content-Type", m[1]);
    return res.send(Buffer.from(m[2], "base64"));
  }

  if (req.method === "GET") {
    const from = Date.parse(req.query.from) ? new Date(req.query.from).toISOString() : new Date(Date.now() - 31 * 864e5).toISOString();
    const to = Date.parse(req.query.to) ? new Date(req.query.to).toISOString() : new Date(Date.now() + 864e5).toISOString();
    const window = q => q.gte("created_at", from).lt("created_at", to);
    const [rows, withPhoto] = await Promise.all([
      selectAll(() => window(db.from("sales").select(COLS)).order("created_at", { ascending: false }).order("id")),
      // Only the ids of sales that have a photo — never the photos themselves (keeps the response small).
      selectAll(() => window(db.from("sales").select("id")).not("thumbnail", "is", null).order("id")),
    ]);
    const error = rows.error || withPhoto.error;
    if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
    const photoIds = new Set(withPhoto.data.map(r => r.id));
    return res.json({ sales: rows.data.map(s => ({ ...s, has_photo: photoIds.has(s.id) })) });
  }

  if (req.method !== "POST") return res.status(405).end();
  if (req.body?.action !== "void") return res.status(400).json({ error: "Unknown action." });
  const { data: sale } = await db.from("sales").select("id,item_id,quantity").eq("id", String(req.body.id || "")).maybeSingle();
  if (!sale) return res.status(404).json({ error: "Sale not found." });
  const { error } = await db.from("sales").delete().eq("id", sale.id);
  if (error) return res.status(500).json({ error: error.message });
  // Put the stock back (compare-and-set so a sale happening at the same moment isn't lost).
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: item } = await db.from("items").select("quantity").eq("id", sale.item_id).maybeSingle();
    if (!item) break; // item was deleted — nothing to restore
    const { data: done } = await db.from("items").update({ quantity: item.quantity + sale.quantity, updated_at: new Date().toISOString() })
      .eq("id", sale.item_id).eq("quantity", item.quantity).select("id");
    if (done?.length) break;
  }
  res.json({ ok: true });
}
