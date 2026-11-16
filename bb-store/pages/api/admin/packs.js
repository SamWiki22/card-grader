import { randomBytes } from "crypto";
import { requireAdmin } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { listTiers, oddsFor, expectedValue, getBuybackRules } from "../../../lib/packs";
import { TCG_SOURCES, marketCents } from "../../../lib/tcg";
import { COMP_SOURCES } from "../../../lib/shared";
import { refreshPrices } from "../../../lib/prices";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const cents = v => Math.round(Number(v) * 100);
const intOrNull = v => (v === "" || v == null ? null : Math.max(0, Math.min(100, Math.round(Number(v)))));
const TCG_COLS = "tcg_category_id,tcg_group_id,tcg_product_id,tcg_subtype,price_source,price_updated_at,comp_cents,comp_source,comp_date,comp_url";

// GET: tiers with pool stats, every card, open shipments.
// POST { action, ... }: tier / card / shipment changes.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const SUB_COLS = "id,user_id,game,name,set_name,card_number,grade,asking_cents,note,tcg_product_id,market_cents,value_cents,offer_cents,admin_note,status,card_id,created_at,updated_at";
    const [tiers, cards, ships, rules, items, openSubs, closedSubs] = await Promise.all([
      listTiers({ includeInactive: true }),
      db.from("pack_cards").select(`id,tier_id,name,set_name,grade,market_value_cents,weight,buyback_percent,status,owner_id,created_at,${TCG_COLS}`).order("created_at", { ascending: false }),
      db.from("shipments").select("*").order("created_at", { ascending: false }).limit(100),
      getBuybackRules(),
      db.from("items").select(`id,name,set_name,game,condition,quantity,price,${TCG_COLS}`).eq("type", "single").order("name"),
      db.from("submissions").select(SUB_COLS).in("status", ["submitted", "offered", "accepted"]).order("created_at"),
      db.from("submissions").select(SUB_COLS).in("status", ["paid", "declined", "rejected"]).order("updated_at", { ascending: false }).limit(20),
    ]);
    const subs = [...(openSubs.data || []), ...(closedSubs.data || [])];
    const ids = [...new Set(subs.map(s => s.user_id))];
    const { data: people } = ids.length ? await db.from("profiles").select("user_id,email").in("user_id", ids) : { data: [] };
    const emailOf = Object.fromEntries((people || []).map(p => [p.user_id, p.email]));
    const submissions = subs.map(({ user_id, ...s }) => ({ ...s, email: emailOf[user_id] || "" }));
    const all = cards.data || [];
    const stats = tiers.map(t => {
      const pool = all.filter(c => c.tier_id === t.id && c.status === "available");
      const ev = expectedValue(pool);
      return { ...t, poolSize: pool.length, evCents: Math.round(ev), margin: pool.length ? 1 - ev / t.price_cents : null, odds: oddsFor(pool, Number(t.price_cents)) };
    });
    const names = Object.fromEntries(all.map(c => [c.id, `${c.name}${c.grade ? ` (${c.grade})` : ""}`]));
    const shipments = (ships.data || []).map(s => ({ ...s, cards: s.card_ids.map(id => names[id] || id) }));
    return res.json({ tiers: stats, cards: all, shipments, rules, submissions, items: items.data || [], tcgSources: TCG_SOURCES.map(({ id, game, label }) => ({ id, game, label })) });
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
        buyback_percent: intOrNull(b.buyback_percent),
        ...tcgLink(b.tcg),
      });
      break;
    }

    case "update-card": {
      const patch = { updated_at: new Date().toISOString() };
      if (b.value !== undefined) patch.market_value_cents = cents(b.value);
      if (b.weight !== undefined && Number(b.weight) > 0) patch.weight = Number(b.weight);
      if (b.tier_id) patch.tier_id = String(b.tier_id);
      if (b.buyback_percent !== undefined) patch.buyback_percent = intOrNull(b.buyback_percent);
      // Only cards sitting in a pool can be pulled out of it; vaulted cards belong to someone.
      if (b.status === "retired" || b.status === "available") patch.status = b.status;
      let q = db.from("pack_cards").update(patch).eq("id", String(b.id));
      if (patch.status) q = q.in("status", ["available", "retired"]);
      result = await q;
      break;
    }

    case "save-buyback-rules": {
      const rules = (Array.isArray(b.rules) ? b.rules : [])
        .map(r => ({ min_value_cents: cents(r.min), percent: intOrNull(r.percent) }))
        .filter(r => r.min_value_cents >= 0 && r.percent != null);
      if (!rules.some(r => r.min_value_cents === 0)) return res.status(400).json({ error: "Keep a rule that starts at $0." });
      if (new Set(rules.map(r => r.min_value_cents)).size !== rules.length) return res.status(400).json({ error: "Two rules start at the same value." });
      result = await db.rpc("set_buyback_rules", { p_rules: rules });
      break;
    }

    // Link a pack card or store single to a TCGplayer product (and optionally
    // let its price follow TCGplayer's market price from now on).
    case "link-tcg": {
      const table = b.target === "item" ? "items" : "pack_cards";
      const link = tcgLink(b.tcg);
      if (!link.tcg_product_id) return res.status(400).json({ error: "Pick a TCGplayer card." });
      const patch = { ...link };
      if (link.price_source === "tcgplayer") {
        // No TCGplayer price yet? Fall back to the card's recorded last sale, if any.
        let m = await marketCents(link.tcg_category_id, link.tcg_group_id, link.tcg_product_id, link.tcg_subtype);
        if (m == null) {
          const { data: row } = await db.from(table).select("comp_cents").eq("id", String(b.id)).maybeSingle();
          m = row?.comp_cents ?? null;
        }
        if (m == null) return res.status(409).json({ error: "TCGplayer has no market price for that card yet. Add a last-sold price first, or link without syncing." });
        patch.price_updated_at = new Date().toISOString();
        if (table === "items") patch.price = m / 100; else patch.market_value_cents = m;
      }
      if (table === "pack_cards" && b.tcg?.imageUrl) patch.image = String(b.tcg.imageUrl);
      result = await db.from(table).update(patch).eq("id", String(b.id));
      break;
    }

    // Record a card's last sale (eBay, Goldin, Card Ladder…). With use=true the
    // sale price becomes the card's value; otherwise it's kept as a backup.
    case "save-comp": {
      const table = b.target === "item" ? "items" : "pack_cards";
      const comp = b.price === "" || b.price == null ? null : cents(b.price);
      if (comp != null && !(comp >= 0)) return res.status(400).json({ error: "Enter a valid sale price." });
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || "")) ? String(b.date) : null;
      const url = /^https:\/\//.test(String(b.url || "")) ? String(b.url).slice(0, 500) : null;
      const patch = {
        comp_cents: comp,
        comp_source: COMP_SOURCES.includes(b.source) ? b.source : null,
        comp_date: date,
        comp_url: url,
      };
      if (b.use && comp != null) {
        patch.price_source = "comp";
        patch.price_updated_at = new Date().toISOString();
        if (table === "items") patch.price = comp / 100; else patch.market_value_cents = comp;
      } else if (!b.use) {
        const { data: row } = await db.from(table).select("price_source").eq("id", String(b.id)).maybeSingle();
        if (row?.price_source === "comp") patch.price_source = "manual";
      }
      result = await db.from(table).update(patch).eq("id", String(b.id));
      break;
    }

    // Player-submitted cards: make an offer, reject, or (once the card arrives) pay + add to a pool.
    case "offer-submission": {
      const offer = cents(b.offer), value = cents(b.value);
      if (!(offer >= 0) || !(value >= 0)) return res.status(400).json({ error: "Enter an offer and a value." });
      const { data } = await db.from("submissions")
        .update({ offer_cents: offer, value_cents: value, admin_note: String(b.note || "").slice(0, 500), status: "offered", updated_at: new Date().toISOString() })
        .eq("id", String(b.id)).in("status", ["submitted", "offered"]).select("id");
      if (!data?.length) return res.status(409).json({ error: "That submission can’t take an offer right now." });
      return res.json({ ok: true });
    }

    case "reject-submission": {
      const { data } = await db.from("submissions")
        .update({ status: "rejected", admin_note: String(b.note || "").slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", String(b.id)).in("status", ["submitted", "offered", "accepted"]).select("id");
      if (!data?.length) return res.status(409).json({ error: "That submission is already closed." });
      return res.json({ ok: true });
    }

    case "pay-submission":
      result = await db.rpc("pay_submission", { p_id: String(b.id), p_tier: String(b.tier || ""), p_value: cents(b.value), p_card_id: randomBytes(8).toString("hex") });
      if (result.error?.message?.includes("NOT_ACCEPTED")) return res.status(409).json({ error: "The player hasn’t accepted this offer (or it’s already paid)." });
      break;

    case "unlink-tcg": {
      const table = b.target === "item" ? "items" : "pack_cards";
      result = await db.from(table).update({ tcg_category_id: null, tcg_group_id: null, tcg_product_id: null, tcg_subtype: null, price_source: "manual" }).eq("id", String(b.id));
      break;
    }

    case "refresh-prices":
      try { return res.json({ ok: true, ...(await refreshPrices()) }); }
      catch (e) { console.error(e); return res.status(502).json({ error: e.message }); }

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

// Pull TCGplayer link fields out of a request, validated.
function tcgLink(t) {
  if (!t?.productId) return {};
  return {
    tcg_category_id: Number(t.categoryId),
    tcg_group_id: Number(t.groupId),
    tcg_product_id: Number(t.productId),
    tcg_subtype: String(t.subType || "").slice(0, 40) || null,
    price_source: t.autoPrice ? "tcgplayer" : "manual",
  };
}
