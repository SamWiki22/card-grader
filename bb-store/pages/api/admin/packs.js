import { randomBytes } from "crypto";
import { requireAdmin } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { listTiers, oddsFor, expectedValue } from "../../../lib/packs";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const cents = v => Math.round(Number(v) * 100);

// GET: tiers with pool stats, every card, open shipments.
// POST { action, ... }: tier / card / shipment changes.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const [tiers, cards, ships] = await Promise.all([
      listTiers({ includeInactive: true }),
      db.from("pack_cards").select("id,tier_id,name,set_name,grade,market_value_cents,weight,status,owner_id,created_at").order("created_at", { ascending: false }),
      db.from("shipments").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    const all = cards.data || [];
    const stats = tiers.map(t => {
      const pool = all.filter(c => c.tier_id === t.id && c.status === "available");
      const ev = expectedValue(pool);
      return { ...t, poolSize: pool.length, evCents: Math.round(ev), margin: pool.length ? 1 - ev / t.price_cents : null, odds: oddsFor(pool, Number(t.price_cents)) };
    });
    const names = Object.fromEntries(all.map(c => [c.id, `${c.name}${c.grade ? ` (${c.grade})` : ""}`]));
    const shipments = (ships.data || []).map(s => ({ ...s, cards: s.card_ids.map(id => names[id] || id) }));
    return res.json({ tiers: stats, cards: all, shipments });
  }

  if (req.method !== "POST") return res.status(405).end();
  const b = req.body || {};
  let result;

  switch (b.action) {
    case "update-tier":
      result = await db.from("pack_tiers").update({
        name: String(b.name || "").slice(0, 40),
        price_cents: cents(b.price),
        active: !!b.active,
      }).eq("id", String(b.id));
      break;

    case "add-card": {
      if (!b.tier_id || !b.name || !(Number(b.value) >= 0)) return res.status(400).json({ error: "Tier, name and value are required." });
      result = await db.from("pack_cards").insert({
        id: randomBytes(8).toString("hex"),
        tier_id: String(b.tier_id),
        name: String(b.name).slice(0, 120),
        set_name: String(b.set_name || "").slice(0, 120),
        grade: String(b.grade || "").slice(0, 40),
        market_value_cents: cents(b.value),
        weight: Number(b.weight) > 0 ? Number(b.weight) : 1,
        image: b.image ? String(b.image) : null,
      });
      break;
    }

    case "update-card": {
      const patch = { updated_at: new Date().toISOString() };
      if (b.value !== undefined) patch.market_value_cents = cents(b.value);
      if (b.weight !== undefined && Number(b.weight) > 0) patch.weight = Number(b.weight);
      if (b.tier_id) patch.tier_id = String(b.tier_id);
      // Only cards sitting in a pool can be pulled out of it; vaulted cards belong to someone.
      if (b.status === "retired" || b.status === "available") patch.status = b.status;
      let q = db.from("pack_cards").update(patch).eq("id", String(b.id));
      if (patch.status) q = q.in("status", ["available", "retired"]);
      result = await q;
      break;
    }

    case "mark-shipped": {
      const { data: s } = await db.from("shipments").select("card_ids").eq("id", Number(b.id)).maybeSingle();
      if (!s) return res.status(404).json({ error: "Shipment not found." });
      result = await db.from("shipments").update({ status: "shipped", tracking: String(b.tracking || "").slice(0, 80), shipped_at: new Date().toISOString() }).eq("id", Number(b.id));
      if (!result.error) result = await db.from("pack_cards").update({ status: "shipped", updated_at: new Date().toISOString() }).in("id", s.card_ids);
      break;
    }

    default:
      return res.status(400).json({ error: "Unknown action." });
  }

  if (result?.error) {
    console.error(result.error);
    return res.status(500).json({ error: result.error.message });
  }
  res.json({ ok: true });
}
