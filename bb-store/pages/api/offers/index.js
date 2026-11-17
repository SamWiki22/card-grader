import { randomBytes } from "crypto";
import { db } from "../../../lib/catalog";

const clean = (v, n) => String(v || "").trim().slice(0, n);

// Public: a customer makes an offer on a store item. Returns the private offer link token.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!db) return res.status(503).json({ error: "Offers aren’t available right now." });
  const b = req.body || {};
  if (b.website) return res.json({ id: "ok" }); // honeypot: bots fill hidden fields
  const name = clean(b.name, 80), email = clean(b.email, 120).toLowerCase(), phone = clean(b.phone, 30);
  const amount = Math.round(Number(b.amount) * 100);
  const qty = Math.max(1, Math.round(Number(b.quantity) || 1));
  if (!name) return res.status(400).json({ error: "Enter your name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email so we can reply." });
  if (!(amount > 0)) return res.status(400).json({ error: "Enter your offer amount." });

  const { data: item } = await db.from("items").select("id,name,set_name,condition,quantity,price").eq("id", clean(b.itemId, 60)).maybeSingle();
  if (!item || item.quantity <= 0 || Number(item.price) <= 0) return res.status(404).json({ error: "That item isn’t available anymore." });
  if (qty > item.quantity) return res.status(400).json({ error: `Only ${item.quantity} available.` });
  if (amount >= Math.round(Number(item.price) * 100)) return res.status(400).json({ error: "That’s at or above the listed price — just add it to your cart!" });

  // Light spam guard: at most 5 open offers per email.
  const { data: open } = await db.from("offers").select("id").eq("email", email).eq("status", "pending");
  if ((open || []).length >= 5) return res.status(429).json({ error: "You have 5 offers waiting already — we’ll get back to you soon." });

  const id = randomBytes(12).toString("hex");
  const label = [item.name, item.set_name, item.condition].filter(Boolean).join(" · ");
  const { error } = await db.from("offers").insert({
    id, item_id: item.id, item_name: label.slice(0, 200), list_price: Number(item.price),
    name, email, phone, quantity: qty, amount_cents: amount, message: clean(b.message, 500),
  });
  if (error) { console.error(error); return res.status(500).json({ error: "Couldn’t send your offer. Try again." }); }
  res.json({ id });
}
