import { requireStaff } from "../../../lib/auth";
import { db, selectAll } from "../../../lib/catalog";
import { OFFER_HOURS } from "../../../lib/offers";

// Staff + admins: review customer offers and accept / counter / decline them.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const staff = await requireStaff(req, res);
  if (!staff) return;

  if (req.method === "GET") {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data, error } = await selectAll(() => db.from("offers").select("*").gte("created_at", since).order("created_at", { ascending: false }).order("id"));
    if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
    const ids = [...new Set(data.map(o => o.item_id))];
    const { data: items } = ids.length ? await db.from("items").select("id,quantity,price").in("id", ids) : { data: [] };
    const stock = Object.fromEntries((items || []).map(i => [i.id, i]));
    return res.json({ offers: data.map(o => ({ ...o, in_stock: stock[o.item_id]?.quantity ?? 0, current_price: Number(stock[o.item_id]?.price ?? o.list_price) })) });
  }
  if (req.method !== "POST") return res.status(405).end();

  const b = req.body || {};
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + OFFER_HOURS * 36e5).toISOString();
  const note = String(b.note || "").slice(0, 300);
  let patch;
  if (b.action === "accept") patch = { status: "accepted", counter_cents: null, expires_at: expires, admin_note: note };
  else if (b.action === "counter") {
    const c = Math.round(Number(b.amount) * 100);
    if (!(c > 0)) return res.status(400).json({ error: "Enter your counter amount." });
    patch = { status: "countered", counter_cents: c, expires_at: expires, admin_note: note };
  } else if (b.action === "decline") patch = { status: "declined", admin_note: note };
  else return res.status(400).json({ error: "Unknown action." });

  const { data } = await db.from("offers").update({ ...patch, updated_at: now }).eq("id", String(b.id || "")).in("status", ["pending", "countered", "accepted"]).select("id");
  if (!data?.length) return res.status(409).json({ error: "That offer is already closed." });
  res.json({ ok: true });
}
