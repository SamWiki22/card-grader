import { requireStaff, requireAdmin } from "../../../lib/auth";
import { db, selectAll } from "../../../lib/catalog";
import { findNumbers, hasNumber, isCode } from "../../../lib/numbers";
import { bulkFloorCents } from "../../../lib/shared";

// POST { action: "find", where: "store" | "pools", from }  → suggestions for cards with no number in their name
// POST { action: "save", where, changes: [{ id, from, to }] } → renames; skips any card whose name changed meanwhile
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const b = req.body || {};
  const pools = b.where === "pools";
  const who = pools ? await requireAdmin(req, res) : await requireStaff(req, res);
  if (!who) return;
  const table = pools ? "pack_cards" : "items";
  const TCG = "tcg_category_id,tcg_group_id,tcg_product_id";

  if (b.action === "find") {
    let rows, withRarity = !pools;
    if (pools) {
      const [{ data: cards, error }, { data: tiers }] = await Promise.all([
        selectAll(() => db.from("pack_cards").select(`id,name,set_name,tier_id,${TCG}`).eq("status", "available").order("id")),
        db.from("pack_tiers").select("id,game"),
      ]);
      if (error) return res.status(500).json({ error: error.message });
      const gameOf = Object.fromEntries((tiers || []).map(t => [t.id, t.game]));
      rows = (cards || []).map(c => ({ ...c, game: gameOf[c.tier_id] }));
    } else {
      // With rarity once the database has the column; without it before then.
      let { data, error } = await selectAll(() => db.from("items").select(`id,name,set_name,game,type,rarity,${TCG}`).eq("type", "single").order("id"));
      if (error && /rarity/.test(error.message || "")) { withRarity = false; ({ data, error } = await selectAll(() => db.from("items").select(`id,name,set_name,game,type,${TCG}`).eq("type", "single").order("id"))); }
      if (error) return res.status(500).json({ error: error.message });
      rows = data || [];
    }
    const missing = rows.filter(r => !hasNumber(r.name) || isCode(r.set_name) || (withRarity && !String(r.rarity || "").trim()));
    const from = Math.max(0, Number(b.from) || 0);
    // Same set together so each set's card list is downloaded once.
    missing.sort((a, c) => `${a.game}|${a.set_name}`.localeCompare(`${c.game}|${c.set_name}`) || String(a.id).localeCompare(String(c.id)));
    const r = await findNumbers(missing.slice(from), { withRarity });
    return res.json({ ...r, next: from + r.next, total: missing.length, checked: rows.length, withRarity });
  }

  if (b.action === "save") {
    const changes = (Array.isArray(b.changes) ? b.changes : []).slice(0, 2000);
    let saved = 0, skipped = 0;
    for (const c of changes) {
      const to = String(c.to || "").trim().slice(0, 200);
      if (!c.id || !to || !c.from) { skipped++; continue; }
      const rarity = !pools && c.rarity ? String(c.rarity).trim().slice(0, 40) : "";
      // Only rename if the name is still what we looked up (compare-and-set).
      const patch = { name: to, updated_at: new Date().toISOString() };
      let q = db.from(table);
      const toSet = String(c.toSet || "").trim().slice(0, 160);
      if (toSet && c.fromSet != null) patch.set_name = toSet;
      if (rarity) {
        patch.rarity = rarity;
        // Bulk singles go up to the standard rate for their (new) rarity.
        const { data: cur } = await db.from("items").select("type,price,foil").eq("id", c.id).maybeSingle();
        const floor = cur?.type === "single" ? bulkFloorCents(rarity, cur.foil) : 0;
        if (floor && Math.round(Number(cur.price) * 100) < floor) patch.price = floor / 100;
      }
      q = q.update(patch).eq("id", c.id).eq("name", c.from);
      if (patch.set_name) q = q.eq("set_name", String(c.fromSet));
      const { data, error } = await q.select("id");
      if (error) { console.error(error); skipped++; } else if (data?.length) saved++; else skipped++;
    }
    return res.json({ ok: true, saved, skipped });
  }

  res.status(400).json({ error: "Unknown action." });
}
