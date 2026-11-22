import { randomBytes } from "crypto";
import { requireStaff } from "../../../lib/auth";
import { marketCents } from "../../../lib/tcg";
import { db, selectAll } from "../../../lib/catalog";
import { bulkFloorCents } from "../../../lib/shared";

// Photos come in as data URLs after rotating in the browser.
export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

// Every column BB Inventory edits, minus the photo blob.
const COLS = "id,type,game,owner,name,set_name,sku,condition,quantity,cost,price,low_stock,notes,tcg_product_id,price_source,created_at,updated_at";
const RARITY_COLS = ",rarity,foil";
const NEEDS_SQL = "Rarity needs a one-time database update: run supabase/packs.sql in Supabase (SQL Editor), then try again.";
const missingColumn = e => e && (e.code === "42703" || e.code === "PGRST204" || /rarity|foil/.test(e.message || "") && /column/.test(e.message || ""));
const OWNERS = ["sam", "bear_umer", "shared"];
const TYPES = ["single", "box", "pack"];
const EDITABLE = { name: "text", set_name: "text", condition: "text", game: "text", type: "text", owner: "text", notes: "text", sku: "text", quantity: "int", price: "money", cost: "money", rarity: "text", foil: "bool" };
const now = () => new Date().toISOString();

// Inventory admin (staff + admins): list, add, edit, delete, mark sales, hide sold-out stock, replace photos.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const staff = await requireStaff(req, res);
  if (!staff) return;

  if (req.method === "GET") {
    // id breaks ties so cards never jump around; selectAll pages past Supabase's 1,000-row limit.
    let { data, error } = await selectAll(() => db.from("items").select(COLS + RARITY_COLS).order("created_at", { ascending: false }).order("id"));
    let rarity = true;
    // Database not updated yet: still show everything, just without rarity.
    if (missingColumn(error)) { rarity = false; ({ data, error } = await selectAll(() => db.from("items").select(COLS).order("created_at", { ascending: false }).order("id"))); }
    if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
    return res.json({ items: data, rarity });
  }
  if (req.method !== "POST") return res.status(405).end();

  const b = req.body || {};
  const id = String(b.id || "");

  switch (b.action) {
    // Add a new item, optionally linked to a TCGplayer product (photo + market price).
    case "create": {
      const f = b.fields || {};
      const name = String(f.name || "").trim().slice(0, 200);
      if (!name) return res.status(400).json({ error: "Enter a name." });
      const photo = String(f.photo || "");
      const okPhoto = /^https:\/\/tcgplayer-cdn\.tcgplayer\.com\//.test(photo) || (/^data:image\/(jpeg|png|webp);base64,/.test(photo) && photo.length <= 5_000_000);
      const t = b.tcg?.productId ? b.tcg : null;
      const row = {
        id: Date.now().toString(36) + randomBytes(4).toString("hex"),
        type: TYPES.includes(f.type) ? f.type : "single",
        game: String(f.game || "other").slice(0, 20),
        owner: OWNERS.includes(f.owner) ? f.owner : "",
        name,
        set_name: String(f.set_name || "").slice(0, 200),
        sku: String(f.sku || "").slice(0, 60),
        condition: String(f.condition || "").slice(0, 40),
        quantity: Math.max(0, Math.round(Number(f.quantity) || 0)),
        cost: Math.max(0, Math.round(Number(f.cost) * 100) / 100 || 0),
        price: Math.max(0, Math.round(Number(f.price) * 100) / 100 || 0),
        low_stock: 0,
        notes: String(f.notes || "").slice(0, 500),
        photo: okPhoto ? photo : null,
        ...(String(f.rarity || "").trim() ? { rarity: String(f.rarity).trim().slice(0, 40) } : {}),
        ...(f.foil ? { foil: true } : {}),
        ...(t ? {
          tcg_category_id: Number(t.categoryId), tcg_group_id: Number(t.groupId), tcg_product_id: Number(t.productId),
          tcg_subtype: String(t.subType || "").slice(0, 40) || null,
          price_source: t.autoPrice ? "tcgplayer" : "manual",
          price_updated_at: t.autoPrice ? now() : null,
        } : {}),
      };
      // With price sync on, start from today's market price.
      if (t?.autoPrice) {
        const m = await marketCents(row.tcg_category_id, row.tcg_group_id, row.tcg_product_id, row.tcg_subtype).catch(() => null);
        if (m != null) row.price = m / 100;
      }
      // Bulk singles never go below the standard rate for their rarity.
      const floor = row.type === "single" ? bulkFloorCents(row.rarity, row.foil) : 0;
      if (floor && Math.round(row.price * 100) < floor) row.price = floor / 100;
      const { error } = await db.from("items").insert(row);
      if (missingColumn(error)) return res.status(500).json({ error: NEEDS_SQL });
      if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
      return res.json({ ok: true, id: row.id, price: row.price });
    }

    case "delete": {
      const { error } = await db.from("items").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    case "update": {
      const patch = { updated_at: now() };
      for (const [k, kind] of Object.entries(EDITABLE)) {
        if (b.fields?.[k] === undefined) continue;
        const v = b.fields[k];
        if (kind === "int") patch[k] = Math.max(0, Math.round(Number(v) || 0));
        else if (kind === "money") patch[k] = Math.max(0, Math.round(Number(v) * 100) / 100 || 0);
        else if (kind === "bool") patch[k] = !!v;
        else if (k === "owner") patch[k] = OWNERS.includes(v) ? v : "";
        else patch[k] = String(v).trim().slice(0, 200);
      }
      // Changing rarity/foil/price on a single: keep it at or above the standard bulk rate.
      if ("rarity" in patch || "foil" in patch || "price" in patch) {
        const { data: cur } = await db.from("items").select("type,price,rarity,foil").eq("id", id).maybeSingle();
        if (cur) {
          const next = { ...cur, ...patch };
          const floor = next.type === "single" ? bulkFloorCents(next.rarity, next.foil) : 0;
          if (floor && Math.round(Number(next.price) * 100) < floor) patch.price = floor / 100;
        }
      }
      const { error } = await db.from("items").update(patch).eq("id", id);
      if (missingColumn(error)) return res.status(500).json({ error: NEEDS_SQL });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    // Sold in person / elsewhere: take 1+ out of stock and log it in BB Inventory's sales.
    case "sold": {
      const qty = Math.max(1, Math.round(Number(b.qty) || 1));
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: item } = await db.from("items").select("*").eq("id", id).maybeSingle();
        if (!item) return res.status(404).json({ error: "Item not found." });
        if (item.quantity < qty) return res.status(409).json({ error: `Only ${item.quantity} in stock.` });
        const price = b.price !== undefined && b.price !== "" && b.price !== null ? Math.max(0, Number(b.price) || 0) : Number(item.price);
        // Sales recorded later (e.g. from a group-text photo) can carry the day they happened.
        const soldAt = b.soldAt && !Number.isNaN(Date.parse(b.soldAt)) && Date.parse(b.soldAt) <= Date.now() + 864e5 ? new Date(b.soldAt).toISOString() : null;
        const thumb = typeof b.thumbnail === "string" && /^data:image\/jpeg;base64,/.test(b.thumbnail) && b.thumbnail.length <= 120_000 ? b.thumbnail : null;
        // Compare-and-set so a sale rung up in BB Inventory at the same moment isn't lost.
        const { data: updated } = await db.from("items").update({ quantity: item.quantity - qty, updated_at: now() })
          .eq("id", id).eq("quantity", item.quantity).select("id");
        if (!updated?.length) continue;
        const { error: saleError } = await db.from("sales").insert({
          id: Date.now().toString(36) + randomBytes(3).toString("hex"),
          item_id: id, item_name: item.name || "", item_set: item.set_name || "", item_type: item.type || "",
          owner: item.owner || "", item_cost: Number(item.cost) || 0,
          quantity: qty, price, total: Math.round(price * qty * 100) / 100,
          sold_by: String(b.soldBy || staff.email.split("@")[0]).slice(0, 60), thumbnail: thumb,
          ...(soldAt ? { created_at: soldAt } : {}),
        });
        if (saleError) {
          // Couldn't log the sale — put the stock back so inventory and sales stay in step.
          console.error(saleError);
          await db.from("items").update({ quantity: item.quantity, updated_at: now() }).eq("id", id).eq("quantity", item.quantity - qty);
          return res.status(500).json({ error: "Couldn’t save the sale — stock was left unchanged. Try again." });
        }
        return res.json({ ok: true, quantity: item.quantity - qty });
      }
      return res.status(409).json({ error: "Stock changed at the same moment — try again." });
    }

    // Bulk: set the quantity on many items (0 = hide from the store; nothing is deleted).
    case "set-quantity": {
      const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 500) : [];
      if (!ids.length) return res.status(400).json({ error: "Select some items." });
      const { error } = await db.from("items").update({ quantity: Math.max(0, Math.round(Number(b.quantity) || 0)), updated_at: now() }).in("id", ids);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, count: ids.length });
    }

    // Standard bulk prices: raise every single priced under its rarity's rate.
    // { apply: false } just counts; { apply: true } saves.
    case "bulk-prices": {
      const { data, error } = await selectAll(() => db.from("items").select("id,name,type,price,rarity,foil,quantity").eq("type", "single").order("id"));
      if (missingColumn(error)) return res.status(500).json({ error: NEEDS_SQL });
      if (error) return res.status(500).json({ error: error.message });
      const low = (data || []).map(r => ({ ...r, floor: bulkFloorCents(r.rarity, r.foil) }))
        .filter(r => r.floor && Math.round(Number(r.price) * 100) < r.floor);
      const noRarity = (data || []).filter(r => !String(r.rarity || "").trim() && r.quantity > 0).length;
      if (!b.apply) return res.json({ ok: true, count: low.length, noRarity, sample: low.slice(0, 8).map(r => ({ name: r.name, rarity: r.rarity, foil: r.foil, from: Number(r.price), to: r.floor / 100 })) });
      let saved = 0;
      for (const r of low) {
        // Only if the price hasn't changed since we looked.
        const { data: u } = await db.from("items").update({ price: r.floor / 100, updated_at: now() }).eq("id", r.id).eq("price", r.price).select("id");
        if (u?.length) saved++;
      }
      return res.json({ ok: true, saved });
    }

    case "set-photo": {
      const photo = String(b.photo || "");
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo) || photo.length > 5_000_000) return res.status(400).json({ error: "Invalid photo." });
      const { error } = await db.from("items").update({ photo, updated_at: now() }).eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    default:
      return res.status(400).json({ error: "Unknown action." });
  }
}
