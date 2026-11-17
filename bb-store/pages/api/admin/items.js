import { randomBytes } from "crypto";
import { requireStaff } from "../../../lib/auth";
import { marketCents } from "../../../lib/tcg";
import { db } from "../../../lib/catalog";

// Photos come in as data URLs after rotating in the browser.
export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

// Every column BB Inventory edits, minus the photo blob.
const COLS = "id,type,game,owner,name,set_name,sku,condition,quantity,cost,price,low_stock,notes,tcg_product_id,price_source,created_at,updated_at";
const OWNERS = ["sam", "bear_umer", "shared"];
const TYPES = ["single", "box", "pack"];
const EDITABLE = { name: "text", set_name: "text", condition: "text", game: "text", type: "text", owner: "text", notes: "text", sku: "text", quantity: "int", price: "money", cost: "money" };
const now = () => new Date().toISOString();

// Inventory admin (staff + admins): list, add, edit, delete, mark sales, hide sold-out stock, replace photos.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const staff = await requireStaff(req, res);
  if (!staff) return;

  if (req.method === "GET") {
    const { data, error } = await db.from("items").select(COLS).order("created_at", { ascending: false }).order("id"); // id breaks ties so cards never jump around
    if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
    return res.json({ items: data });
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
      const { error } = await db.from("items").insert(row);
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
        else if (k === "owner") patch[k] = OWNERS.includes(v) ? v : "";
        else patch[k] = String(v).slice(0, 200);
      }
      const { error } = await db.from("items").update(patch).eq("id", id);
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
        const price = b.price !== undefined && b.price !== "" ? Number(b.price) : Number(item.price);
        // Compare-and-set so a sale rung up in BB Inventory at the same moment isn't lost.
        const { data: updated } = await db.from("items").update({ quantity: item.quantity - qty, updated_at: now() })
          .eq("id", id).eq("quantity", item.quantity).select("id");
        if (!updated?.length) continue;
        await db.from("sales").insert({
          id: Date.now().toString(36) + randomBytes(3).toString("hex"),
          item_id: id, item_name: item.name || "", item_set: item.set_name || "", item_type: item.type || "",
          owner: item.owner || "", item_cost: Number(item.cost) || 0,
          quantity: qty, price, total: Math.round(price * qty * 100) / 100,
          sold_by: String(b.soldBy || "Store admin").slice(0, 60), thumbnail: null,
        });
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
