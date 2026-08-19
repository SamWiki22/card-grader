import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// ── Data / constants ──────────────────────────────────────────────────────

const LAST_SOLD_BY_KEY = "bb-inventory-last-sold-by"; // per-device UI convenience only, not shop data
const MAX_SALES = 300;

const TYPES = [
  { id: "box", label: "Boxes", singular: "Box", icon: "📦", color: "#B5651D" },
  { id: "pack", label: "Packs", singular: "Pack", icon: "🎁", color: "#C77B34" },
  { id: "single", label: "Singles", singular: "Single", icon: "🃏", color: "#5B7B4A" },
];
const TYPE_MAP = Object.fromEntries(TYPES.map(t => [t.id, t]));

const GAMES = [
  { id: "pokemon", label: "Pokémon", icon: "⚡", keywords: ["pokemon", "pokémon"] },
  { id: "mtg", label: "Magic: The Gathering", icon: "🔮", keywords: ["magic", "mtg"] },
  { id: "onepiece", label: "One Piece", icon: "☠️", keywords: ["one piece"] },
  { id: "dbs", label: "Dragon Ball", icon: "🐉", keywords: ["dragon ball", "dragonball"] },
  { id: "gundam", label: "Gundam", icon: "🤖", keywords: ["gundam"] },
  { id: "unionarena", label: "Union Arena", icon: "🎫", keywords: ["union arena"] },
  { id: "other", label: "Other", icon: "🎴", keywords: [] },
];
const GAME_MAP = Object.fromEntries(GAMES.map(g => [g.id, g]));

const OWNERS = [
  { id: "sam", label: "Sam", icon: "🧔" },
  { id: "bear_umer", label: "Bear/Umer", icon: "🐻" },
  { id: "shared", label: "Shared 50/50", icon: "🤝" },
];
const OWNER_MAP = Object.fromEntries(OWNERS.map(o => [o.id, o]));

function inferGame(item) {
  if (item.game && GAME_MAP[item.game]) return item.game;
  const text = ((item.set || "") + " " + (item.name || "")).toLowerCase();
  for (const g of GAMES) {
    if (g.keywords.some(k => text.includes(k))) return g.id;
  }
  return "other";
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

const SORTS = [
  { id: "low-stock", label: "Low stock first" },
  { id: "name-asc", label: "Name A → Z" },
  { id: "name-desc", label: "Name Z → A" },
  { id: "price-desc", label: "Price: high → low" },
  { id: "price-asc", label: "Price: low → high" },
  { id: "qty-desc", label: "Qty: high → low" },
  { id: "qty-asc", label: "Qty: low → high" },
];

const DEFAULT_LOW_STOCK = 2;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function money(n) { return "$" + (Number(n) || 0).toFixed(2); }
function clampQty(n) { return Math.max(0, Math.round(Number(n) || 0)); }

// ── Supabase row <-> app object mapping ─────────────────────────────────
// The DB uses snake_case columns (and "set_name" since "set" is awkward in SQL);
// the rest of this app keeps working with the same camelCase shape as before.

function itemFromRow(row) {
  return {
    id: row.id,
    type: row.type,
    game: row.game || "",
    owner: row.owner || "",
    name: row.name || "",
    set: row.set_name || "",
    sku: row.sku || "",
    condition: row.condition || "",
    quantity: row.quantity ?? 0,
    cost: row.cost ?? 0,
    price: row.price ?? 0,
    lowStock: row.low_stock ?? 0,
    notes: row.notes || "",
    photo: row.photo || null,
  };
}
function itemToRow(item) {
  return {
    id: item.id,
    type: item.type,
    game: item.game || "",
    owner: item.owner || "",
    name: item.name || "",
    set_name: item.set || "",
    sku: item.sku || "",
    condition: item.condition || "",
    quantity: clampQty(item.quantity),
    cost: Number(item.cost) || 0,
    price: Number(item.price) || 0,
    low_stock: clampQty(item.lowStock),
    notes: item.notes || "",
    photo: item.photo || null,
  };
}
function saleFromRow(row) {
  return {
    id: row.id,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    itemId: row.item_id,
    itemName: row.item_name || "",
    itemSet: row.item_set || "",
    itemType: row.item_type || "",
    owner: row.owner || "",
    itemCost: row.item_cost ?? 0,
    quantity: row.quantity ?? 0,
    price: row.price ?? 0,
    total: row.total ?? 0,
    soldBy: row.sold_by || "",
    thumbnail: row.thumbnail || null,
  };
}
function saleToRow(sale) {
  return {
    id: sale.id,
    item_id: sale.itemId,
    item_name: sale.itemName || "",
    item_set: sale.itemSet || "",
    item_type: sale.itemType || "",
    owner: sale.owner || "",
    item_cost: Number(sale.itemCost) || 0,
    quantity: sale.quantity,
    price: sale.price,
    total: sale.total,
    sold_by: sale.soldBy || "",
    thumbnail: sale.thumbnail || null,
  };
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function loadImageEl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
// Phone/tablet cameras often save pixels sideways and rely on an EXIF tag to say how to
// rotate them for display — that tag gets lost once we redraw onto a canvas, so read it here first.
function getExifOrientation(buffer) {
  try {
    const view = new DataView(buffer);
    if (view.getUint16(0, false) !== 0xFFD8) return 1;
    const length = view.byteLength;
    let offset = 2;
    while (offset < length - 1) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xFFE1) {
        if (view.getUint32(offset + 2, false) !== 0x45786966) return 1;
        const tiffOffset = offset + 8;
        const little = view.getUint16(tiffOffset, false) === 0x4949;
        const firstIFDOffset = view.getUint32(tiffOffset + 4, little);
        const dirStart = tiffOffset + firstIFDOffset;
        const entries = view.getUint16(dirStart, little);
        for (let i = 0; i < entries; i++) {
          const entryOffset = dirStart + 2 + i * 12;
          if (view.getUint16(entryOffset, little) === 0x0112) return view.getUint16(entryOffset + 8, little);
        }
        return 1;
      } else if ((marker & 0xFF00) !== 0xFF00) {
        break;
      } else {
        offset += view.getUint16(offset, false);
      }
    }
  } catch (_) {}
  return 1;
}
// Reads a photo file and returns an upright JPEG data URL, correcting EXIF rotation up front
// so every later resize/compress step (which draws to a canvas and drops that metadata) stays correct.
async function readUprightDataUrl(file) {
  let orientation = 1;
  try { orientation = getExifOrientation(await readFileAsArrayBuffer(file)); } catch (_) {}
  const dataUrl = await readFileAsDataUrl(file);
  if (orientation === 1) return dataUrl;
  const img = await loadImageEl(dataUrl);
  const w = img.naturalWidth, h = img.naturalHeight;
  const swapped = orientation >= 5 && orientation <= 8;
  const c = document.createElement("canvas");
  c.width = swapped ? h : w;
  c.height = swapped ? w : h;
  const ctx = c.getContext("2d");
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
  ctx.drawImage(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.92);
}

async function toJpegBase64(dataUrl, maxDim = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) { const r = Math.min(maxDim / w, maxDim / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = reject; img.src = dataUrl;
  });
}
async function toThumbnail(dataUrl, maxDim = 260) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const r = Math.min(maxDim / w, maxDim / h); w = Math.round(w * r); h = Math.round(h * r);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => resolve(dataUrl); img.src = dataUrl;
  });
}
async function toItemPhoto(dataUrl, maxDim = 480) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) { const r = Math.min(maxDim / w, maxDim / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => resolve(dataUrl); img.src = dataUrl;
  });
}

function emptyDraft(type = "box") {
  return {
    id: null,
    type,
    game: "",
    owner: "",
    name: "",
    set: "",
    sku: "",
    condition: type === "single" ? "NM" : "",
    quantity: 1,
    cost: "",
    price: "",
    lowStock: DEFAULT_LOW_STOCK,
    notes: "",
    photo: null,
  };
}

// ── Small UI helpers ───────────────────────────────────────────────────────

const COLORS = {
  bg: "#FAF6F0",
  panel: "#FFFFFF",
  border: "rgba(78,52,34,0.14)",
  text: "#2B1B12",
  textDim: "rgba(43,27,18,0.55)",
  textFaint: "rgba(43,27,18,0.32)",
  amber: "#B5651D",
  amberDark: "#7C4A1B",
  amberSoft: "rgba(181,101,29,0.10)",
  danger: "#C0392B",
  dangerSoft: "rgba(192,57,43,0.10)",
  good: "#5B7B4A",
  info: "#3E6B8A",
  infoSoft: "rgba(62,107,138,0.10)",
};

function StatTile({ label, value, sub, accent }) {
  return (
    <div style={{
      flex: "1 1 150px", minWidth: 150, background: COLORS.panel, border: `1px solid ${COLORS.border}`,
      borderRadius: 16, padding: "16px 18px", boxShadow: "0 1px 3px rgba(78,52,34,0.05)",
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: COLORS.textFaint, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent || COLORS.text, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ children, color, soft }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20,
      fontSize: 12, fontWeight: 700, color, background: soft, border: `1px solid ${color}33`,
    }}>{children}</span>
  );
}

function IconButton({ onClick, children, title, style }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 44, height: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.panel,
      color: COLORS.text, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, ...style,
    }}>{children}</button>
  );
}

// ── Item card ────────────────────────────────────────────────────────────

function ItemCard({ item, onAdjust, onOpen }) {
  const t = TYPE_MAP[item.type];
  const g = GAME_MAP[inferGame(item)];
  const low = item.lowStock > 0 && item.quantity <= item.lowStock;
  const out = item.quantity === 0;
  return (
    <div style={{
      background: COLORS.panel, border: `1px solid ${out ? COLORS.danger + "55" : COLORS.border}`, borderRadius: 18,
      padding: 16, display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "0 1px 3px rgba(78,52,34,0.05)", position: "relative",
    }}>
      <div onClick={() => onOpen(item)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge color={t.color} soft={t.color + "14"}>{t.icon} {t.singular}</Badge>
            {g.id !== "other" && <Badge color={COLORS.textDim} soft="rgba(43,27,18,0.05)">{g.icon} {g.label}</Badge>}
            {OWNER_MAP[item.owner] && <Badge color={COLORS.info} soft={COLORS.infoSoft}>{OWNER_MAP[item.owner].icon} {OWNER_MAP[item.owner].label}</Badge>}
          </div>
          {out ? <Badge color={COLORS.danger} soft={COLORS.dangerSoft}>OUT OF STOCK</Badge>
            : low ? <Badge color={COLORS.danger} soft={COLORS.dangerSoft}>LOW STOCK</Badge> : null}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {item.photo && <img src={item.photo} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 10, flexShrink: 0, border: `1px solid ${COLORS.border}` }} />}
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, lineHeight: 1.25 }}>{item.name || "Unnamed item"}</div>
            {item.set && <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>{item.set}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {item.type === "single" && item.condition && <Badge color={COLORS.amberDark} soft={COLORS.amberSoft}>{item.condition}</Badge>}
          {item.sku && <span style={{ fontSize: 11, color: COLORS.textFaint, fontFamily: "monospace" }}>SKU {item.sku}</span>}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 2 }}>
          <div>
            <div style={{ fontSize: 10, color: COLORS.textFaint, fontWeight: 700, letterSpacing: 0.5 }}>PRICE</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{money(item.price)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: COLORS.textFaint, fontWeight: 700, letterSpacing: 0.5 }}>COST</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textDim }}>{money(item.cost)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 11, color: COLORS.textFaint, fontWeight: 700, letterSpacing: 0.5 }}>QTY ON HAND</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => onAdjust(item.id, -1)} disabled={item.quantity === 0} style={{
            width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg,
            fontSize: 20, fontWeight: 800, color: COLORS.text, opacity: item.quantity === 0 ? 0.35 : 1,
          }}>−</button>
          <div style={{ minWidth: 32, textAlign: "center", fontSize: 20, fontWeight: 800, color: out || low ? COLORS.danger : COLORS.text }}>{item.quantity}</div>
          <button onClick={() => onAdjust(item.id, 1)} style={{
            width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.amber}55`, background: COLORS.amberSoft,
            fontSize: 20, fontWeight: 800, color: COLORS.amberDark,
          }}>+</button>
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit modal ────────────────────────────────────────────────────

function ItemModal({ draft, onChange, onSave, onDelete, onClose, isNew, banner }) {
  const canSave = draft.name.trim().length > 0;
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef();
  const field = (label, node) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: COLORS.textDim, marginBottom: 7 }}>{label}</div>
      {node}
    </div>
  );
  const inputStyle = {
    width: "100%", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`,
    fontSize: 15, color: COLORS.text, background: COLORS.bg, fontFamily: "inherit",
  };

  async function handlePhotoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const upright = await readUprightDataUrl(file);
      const compressed = await toItemPhoto(upright);
      onChange({ ...draft, photo: compressed });
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,27,18,0.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: COLORS.panel,
        borderRadius: "24px 24px 0 0", padding: "22px 22px 32px", boxShadow: "0 -10px 40px rgba(43,27,18,0.2)",
      }}>
        <div style={{ width: 40, height: 4, background: COLORS.border, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text }}>{isNew ? "Add Item" : "Edit Item"}</div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, fontSize: 16 }}>✕</button>
        </div>

        {banner && (
          <div style={{ fontSize: 13, color: COLORS.info, background: COLORS.infoSoft, border: `1px solid ${COLORS.info}30`, borderRadius: 12, padding: "10px 14px", marginBottom: 18, lineHeight: 1.5 }}>{banner}</div>
        )}

        {field("ITEM TYPE", (
          <div style={{ display: "flex", gap: 8 }}>
            {TYPES.map(t => (
              <button key={t.id} onClick={() => onChange({ ...draft, type: t.id, condition: t.id === "single" ? (draft.condition || "NM") : "" })}
                style={{
                  flex: 1, padding: "13px 4px", borderRadius: 12, fontSize: 14, fontWeight: 700,
                  background: draft.type === t.id ? t.color + "18" : COLORS.bg,
                  border: `1.5px solid ${draft.type === t.id ? t.color + "70" : COLORS.border}`,
                  color: draft.type === t.id ? t.color : COLORS.textDim,
                }}>{t.icon} {t.label}</button>
            ))}
          </div>
        ))}

        {field("GAME", (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {GAMES.map(g => (
              <button key={g.id} onClick={() => onChange({ ...draft, game: g.id })} style={{
                padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: draft.game === g.id ? COLORS.amberSoft : COLORS.bg,
                border: `1.5px solid ${draft.game === g.id ? COLORS.amber + "70" : COLORS.border}`,
                color: draft.game === g.id ? COLORS.amberDark : COLORS.textDim,
              }}>{g.icon} {g.label}</button>
            ))}
          </div>
        ))}

        {field("OWNER — WHO PAID FOR THIS", (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {OWNERS.map(o => (
              <button key={o.id} onClick={() => onChange({ ...draft, owner: draft.owner === o.id ? "" : o.id })} style={{
                padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: draft.owner === o.id ? COLORS.infoSoft : COLORS.bg,
                border: `1.5px solid ${draft.owner === o.id ? COLORS.info + "70" : COLORS.border}`,
                color: draft.owner === o.id ? COLORS.info : COLORS.textDim,
              }}>{o.icon} {o.label}</button>
            ))}
          </div>
        ))}

        {field("PHOTO (OPTIONAL)", (
          <div>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoFile} style={{ display: "none" }} />
            {draft.photo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img src={draft.photo} alt="Item" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 12, border: `1px solid ${COLORS.border}` }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button onClick={() => photoRef.current?.click()} disabled={photoBusy} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textDim, fontSize: 12, fontWeight: 700 }}>🔄 Retake</button>
                  <button onClick={() => onChange({ ...draft, photo: null })} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${COLORS.danger}30`, background: COLORS.dangerSoft, color: COLORS.danger, fontSize: 12, fontWeight: 700 }}>🗑️ Remove</button>
                </div>
              </div>
            ) : (
              <button onClick={() => photoRef.current?.click()} disabled={photoBusy} style={{
                width: "100%", padding: "16px 14px", borderRadius: 12, border: `1.5px dashed ${COLORS.border}`,
                background: COLORS.bg, color: COLORS.textDim, fontSize: 13, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>{photoBusy ? "Processing…" : "📷 Add a photo — helps the Sell scanner recognize this item"}</button>
            )}
          </div>
        ))}

        {field("NAME", (
          <input autoFocus value={draft.name} onChange={e => onChange({ ...draft, name: e.target.value })}
            placeholder={draft.type === "box" ? "e.g. Scarlet & Violet Booster Box" : draft.type === "pack" ? "e.g. Prismatic Evolutions Booster Pack" : "e.g. Charizard ex #199"}
            style={inputStyle} />
        ))}

        {field("SET / PRODUCT LINE", (
          <input value={draft.set} onChange={e => onChange({ ...draft, set: e.target.value })}
            placeholder="e.g. Pokémon TCG · Scarlet & Violet" style={inputStyle} />
        ))}

        {draft.type === "single" && field("CONDITION", (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CONDITIONS.map(c => (
              <button key={c} onClick={() => onChange({ ...draft, condition: c })} style={{
                flex: "1 1 60px", padding: "11px 4px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: draft.condition === c ? COLORS.amberSoft : COLORS.bg,
                border: `1.5px solid ${draft.condition === c ? COLORS.amber + "70" : COLORS.border}`,
                color: draft.condition === c ? COLORS.amberDark : COLORS.textDim,
              }}>{c}</button>
            ))}
          </div>
        ))}

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>{field("QUANTITY", (
            <input type="number" inputMode="numeric" min="0" value={draft.quantity}
              onChange={e => onChange({ ...draft, quantity: e.target.value })} style={inputStyle} />
          ))}</div>
          <div style={{ flex: 1 }}>{field("LOW STOCK ALERT AT", (
            <input type="number" inputMode="numeric" min="0" value={draft.lowStock}
              onChange={e => onChange({ ...draft, lowStock: e.target.value })} style={inputStyle} />
          ))}</div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>{field("COST PER UNIT ($)", (
            <input type="number" inputMode="decimal" min="0" step="0.01" value={draft.cost}
              onChange={e => onChange({ ...draft, cost: e.target.value })} placeholder="0.00" style={inputStyle} />
          ))}</div>
          <div style={{ flex: 1 }}>{field("SELL PRICE PER UNIT ($)", (
            <input type="number" inputMode="decimal" min="0" step="0.01" value={draft.price}
              onChange={e => onChange({ ...draft, price: e.target.value })} placeholder="0.00" style={inputStyle} />
          ))}</div>
        </div>

        {field("SKU / BARCODE (OPTIONAL)", (
          <input value={draft.sku} onChange={e => onChange({ ...draft, sku: e.target.value })} placeholder="Optional" style={inputStyle} />
        ))}

        {field("NOTES (OPTIONAL)", (
          <textarea value={draft.notes} onChange={e => onChange({ ...draft, notes: e.target.value })} rows={2}
            placeholder="Optional" style={{ ...inputStyle, resize: "vertical" }} />
        ))}

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          {!isNew && (
            <button onClick={onDelete} style={{
              padding: "15px 18px", borderRadius: 14, background: COLORS.dangerSoft, border: `1.5px solid ${COLORS.danger}40`,
              color: COLORS.danger, fontSize: 15, fontWeight: 700,
            }}>🗑️ Delete</button>
          )}
          <button onClick={onSave} disabled={!canSave} style={{
            flex: 1, padding: "15px 18px", borderRadius: 14, background: canSave ? COLORS.amber : COLORS.border,
            border: "none", color: "#fff", fontSize: 16, fontWeight: 800, opacity: canSave ? 1 : 0.6,
          }}>{isNew ? "Add to Inventory" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Sell via photo modal ────────────────────────────────────────────────

function SellModal({ items, onConfirm, onClose }) {
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [status, setStatus] = useState("awaiting-photo"); // awaiting-photo | identifying | ready
  const [matches, setMatches] = useState([]);
  const [aiNote, setAiNote] = useState("");
  const [selected, setSelected] = useState(null);
  const [manualSearch, setManualSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [soldBy, setSoldBy] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    try { setSoldBy(localStorage.getItem(LAST_SOLD_BY_KEY) || ""); } catch {}
  }, []);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSelected(null); setMatches([]); setAiNote(""); setManualSearch("");
    setStatus("identifying");
    const dataUrl = await readUprightDataUrl(file);
    setPhotoDataUrl(dataUrl);
    try {
      const base64 = await toJpegBase64(dataUrl);
      const catalog = items.map(i => ({ id: i.id, name: i.name, set: i.set, type: i.type, photo: i.photo ? i.photo.split(",")[1] : null }));
      const resp = await fetch("/api/identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, catalog }),
      });
      const data = await resp.json().catch(() => ({}));
      const found = (data.matches || [])
        .map(m => ({ item: items.find(i => i.id === m.id), confidence: m.confidence, reason: m.reason }))
        .filter(m => m.item)
        .slice(0, 5);
      setMatches(found);
      if (data.aiAvailable === false) setAiNote("AI matching isn't configured for this shop yet — search for the item below.");
      else if (found.length === 0) setAiNote("No confident match found — search for the item below.");
    } catch {
      setAiNote("Couldn't reach the matching service — search for the item below.");
    } finally {
      setStatus("ready");
    }
  }

  function retake() {
    setPhotoDataUrl(null); setStatus("awaiting-photo"); setMatches([]); setAiNote(""); setSelected(null); setManualSearch("");
  }

  function pickItem(item) {
    setSelected(item);
    setPrice(item.price ?? 0);
    setQty(1);
  }

  const searchResults = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    if (!q) return [];
    return items.filter(i => (i.name + " " + i.set).toLowerCase().includes(q)).slice(0, 8);
  }, [manualSearch, items]);

  const overselling = selected && qty > selected.quantity;
  const total = (Number(price) || 0) * (Number(qty) || 0);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    try {
      const trimmedSoldBy = soldBy.trim();
      try { localStorage.setItem(LAST_SOLD_BY_KEY, trimmedSoldBy); } catch {}
      await onConfirm({ item: selected, qty: Math.max(1, clampQty(qty)), price: Number(price) || 0, soldBy: trimmedSoldBy, photoDataUrl });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,27,18,0.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: COLORS.panel,
        borderRadius: "24px 24px 0 0", padding: "22px 22px 32px", boxShadow: "0 -10px 40px rgba(43,27,18,0.2)",
      }}>
        <div style={{ width: 40, height: 4, background: COLORS.border, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text }}>📷 Log a Sale</div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, fontSize: 16 }}>✕</button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />

        {!photoDataUrl ? (
          <button onClick={() => fileRef.current?.click()} style={{
            width: "100%", padding: "44px 20px", borderRadius: 18, border: `2px dashed ${COLORS.amber}55`,
            background: COLORS.amberSoft, color: COLORS.amberDark, fontSize: 17, fontWeight: 800,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 40 }}>📷</span>
            Take Photo of Item Sold
          </button>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 18 }}>
              <img src={photoDataUrl} alt="Item being sold" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 14, border: `1px solid ${COLORS.border}` }} />
              <div style={{ flex: 1 }}>
                {status === "identifying" && <div style={{ fontSize: 14, color: COLORS.textDim, fontWeight: 600 }}>🔍 Identifying item…</div>}
                {status === "ready" && aiNote && <div style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.5 }}>{aiNote}</div>}
                <button onClick={retake} style={{ marginTop: 8, padding: "8px 14px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textDim, fontSize: 12, fontWeight: 700 }}>🔄 Retake photo</button>
              </div>
            </div>

            {status === "ready" && matches.length > 0 && !selected && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: COLORS.textDim, marginBottom: 8 }}>SUGGESTED MATCHES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {matches.map(m => {
                    const t = TYPE_MAP[m.item.type];
                    return (
                      <button key={m.item.id} onClick={() => pickItem(m.item)} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px",
                        borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, textAlign: "left",
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t.icon} {m.item.name}</div>
                          <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>{m.item.set} · {m.item.quantity} in stock</div>
                        </div>
                        {typeof m.confidence === "number" && (
                          <Badge color={COLORS.good} soft="rgba(91,123,74,0.10)">{Math.round(m.confidence * 100)}%</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {status === "ready" && !selected && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: COLORS.textDim, marginBottom: 8 }}>OR SEARCH MANUALLY</div>
                <input value={manualSearch} onChange={e => setManualSearch(e.target.value)} placeholder="Search by name or set…"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 14, background: COLORS.bg, color: COLORS.text, marginBottom: 8 }} />
                {searchResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {searchResults.map(item => {
                      const t = TYPE_MAP[item.type];
                      return (
                        <button key={item.id} onClick={() => pickItem(item)} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px",
                          borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.panel, textAlign: "left",
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{t.icon} {item.name}</div>
                          <div style={{ fontSize: 12, color: COLORS.textFaint }}>{item.quantity} in stock</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selected && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 16px", borderRadius: 14, background: COLORS.amberSoft, border: `1px solid ${COLORS.amber}30`, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>{TYPE_MAP[selected.type].icon} {selected.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>{selected.set} · {selected.quantity} in stock</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ fontSize: 12, fontWeight: 700, color: COLORS.amberDark, background: "none", border: "none", padding: 4 }}>Change</button>
                </div>

                <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textDim, marginBottom: 7 }}>QTY SOLD</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, fontSize: 18, fontWeight: 800 }}>−</button>
                      <div style={{ minWidth: 28, textAlign: "center", fontSize: 18, fontWeight: 800 }}>{qty}</div>
                      <button onClick={() => setQty(q => q + 1)} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.amber}55`, background: COLORS.amberSoft, fontSize: 18, fontWeight: 800, color: COLORS.amberDark }}>+</button>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textDim, marginBottom: 7 }}>PRICE EACH ($)</div>
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
                      style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 15, background: COLORS.bg, color: COLORS.text }} />
                  </div>
                </div>

                {overselling && (
                  <div style={{ fontSize: 12, color: COLORS.danger, background: COLORS.dangerSoft, border: `1px solid ${COLORS.danger}30`, borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
                    ⚠️ Only {selected.quantity} in stock — this will zero out inventory. The sale will still be logged.
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textDim, marginBottom: 7 }}>SOLD BY (OPTIONAL)</div>
                  <input value={soldBy} onChange={e => setSoldBy(e.target.value)} placeholder="Employee name"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 14, background: COLORS.bg, color: COLORS.text }} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textDim }}>TOTAL</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.good }}>{money(total)}</div>
                </div>

                <button onClick={confirm} disabled={saving} style={{
                  width: "100%", padding: "15px 18px", borderRadius: 14, background: COLORS.good, border: "none",
                  color: "#fff", fontSize: 16, fontWeight: 800, opacity: saving ? 0.6 : 1,
                }}>{saving ? "Saving…" : "✅ Confirm Sale"}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Price check ──────────────────────────────────────────────────────────
// Same photo -> AI match flow as the Sell modal, but read-only: shows what an
// item is priced at (and how many are in stock) without logging a sale.

function PriceCheckModal({ items, onClose }) {
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [status, setStatus] = useState("awaiting-photo"); // awaiting-photo | identifying | ready
  const [matches, setMatches] = useState([]);
  const [aiNote, setAiNote] = useState("");
  const [selected, setSelected] = useState(null);
  const [manualSearch, setManualSearch] = useState("");
  const fileRef = useRef();

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSelected(null); setMatches([]); setAiNote(""); setManualSearch("");
    setStatus("identifying");
    const dataUrl = await readUprightDataUrl(file);
    setPhotoDataUrl(dataUrl);
    try {
      const base64 = await toJpegBase64(dataUrl);
      const catalog = items.map(i => ({ id: i.id, name: i.name, set: i.set, type: i.type, photo: i.photo ? i.photo.split(",")[1] : null }));
      const resp = await fetch("/api/identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, catalog }),
      });
      const data = await resp.json().catch(() => ({}));
      const found = (data.matches || [])
        .map(m => ({ item: items.find(i => i.id === m.id), confidence: m.confidence, reason: m.reason }))
        .filter(m => m.item)
        .slice(0, 5);
      setMatches(found);
      if (data.aiAvailable === false) setAiNote("AI matching isn't configured for this shop yet — search for the item below.");
      else if (found.length === 0) setAiNote("No confident match found — search for the item below.");
    } catch {
      setAiNote("Couldn't reach the matching service — search for the item below.");
    } finally {
      setStatus("ready");
    }
  }

  function retake() {
    setPhotoDataUrl(null); setStatus("awaiting-photo"); setMatches([]); setAiNote(""); setSelected(null); setManualSearch("");
  }

  const searchResults = useMemo(() => {
    const q = manualSearch.trim().toLowerCase();
    if (!q) return [];
    return items.filter(i => (i.name + " " + i.set).toLowerCase().includes(q)).slice(0, 8);
  }, [manualSearch, items]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,27,18,0.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: COLORS.panel,
        borderRadius: "24px 24px 0 0", padding: "22px 22px 32px", boxShadow: "0 -10px 40px rgba(43,27,18,0.2)",
      }}>
        <div style={{ width: 40, height: 4, background: COLORS.border, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text }}>💲 Price Check</div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, fontSize: 16 }}>✕</button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />

        {!photoDataUrl ? (
          <button onClick={() => fileRef.current?.click()} style={{
            width: "100%", padding: "44px 20px", borderRadius: 18, border: `2px dashed ${COLORS.info}55`,
            background: COLORS.infoSoft, color: COLORS.info, fontSize: 17, fontWeight: 800,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 40 }}>📷</span>
            Take Photo to Check Price
          </button>
        ) : (
          <>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 18 }}>
              <img src={photoDataUrl} alt="Item to price-check" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 14, border: `1px solid ${COLORS.border}` }} />
              <div style={{ flex: 1 }}>
                {status === "identifying" && <div style={{ fontSize: 14, color: COLORS.textDim, fontWeight: 600 }}>🔍 Identifying item…</div>}
                {status === "ready" && aiNote && <div style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.5 }}>{aiNote}</div>}
                <button onClick={retake} style={{ marginTop: 8, padding: "8px 14px", borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textDim, fontSize: 12, fontWeight: 700 }}>🔄 Retake photo</button>
              </div>
            </div>

            {status === "ready" && matches.length > 0 && !selected && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: COLORS.textDim, marginBottom: 8 }}>SUGGESTED MATCHES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {matches.map(m => {
                    const t = TYPE_MAP[m.item.type];
                    return (
                      <button key={m.item.id} onClick={() => setSelected(m.item)} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px",
                        borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, textAlign: "left",
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>{t.icon} {m.item.name}</div>
                          <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>{m.item.set}</div>
                        </div>
                        {typeof m.confidence === "number" && (
                          <Badge color={COLORS.good} soft="rgba(91,123,74,0.10)">{Math.round(m.confidence * 100)}%</Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {status === "ready" && !selected && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: COLORS.textDim, marginBottom: 8 }}>OR SEARCH MANUALLY</div>
                <input value={manualSearch} onChange={e => setManualSearch(e.target.value)} placeholder="Search by name or set…"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 14, background: COLORS.bg, color: COLORS.text, marginBottom: 8 }} />
                {searchResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {searchResults.map(item => {
                      const t = TYPE_MAP[item.type];
                      return (
                        <button key={item.id} onClick={() => setSelected(item)} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px",
                          borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.panel, textAlign: "left",
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{t.icon} {item.name}</div>
                          <div style={{ fontSize: 12, color: COLORS.textFaint }}>{item.quantity} in stock</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selected && (() => {
              const t = TYPE_MAP[selected.type];
              const g = GAME_MAP[inferGame(selected)];
              const low = selected.lowStock > 0 && selected.quantity <= selected.lowStock;
              const out = selected.quantity === 0;
              return (
                <div>
                  <div style={{ padding: 18, borderRadius: 16, background: COLORS.infoSoft, border: `1.5px solid ${COLORS.info}30`, marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      <Badge color={t.color} soft={t.color + "18"}>{t.icon} {t.singular}</Badge>
                      {g.id !== "other" && <Badge color={COLORS.textDim} soft="rgba(43,27,18,0.05)">{g.icon} {g.label}</Badge>}
                      {selected.type === "single" && selected.condition && <Badge color={COLORS.amberDark} soft={COLORS.amberSoft}>{selected.condition}</Badge>}
                      {out ? <Badge color={COLORS.danger} soft={COLORS.dangerSoft}>OUT OF STOCK</Badge> : low ? <Badge color={COLORS.danger} soft={COLORS.dangerSoft}>LOW STOCK</Badge> : null}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>{selected.name}</div>
                    {selected.set && <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>{selected.set}</div>}
                    <div style={{ display: "flex", gap: 28, marginTop: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: COLORS.textFaint, fontWeight: 700, letterSpacing: 0.5 }}>SELL PRICE</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.info }}>{money(selected.price)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: COLORS.textFaint, fontWeight: 700, letterSpacing: 0.5 }}>IN STOCK</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: out ? COLORS.danger : COLORS.text }}>{selected.quantity}</div>
                      </div>
                    </div>
                    {selected.sku && <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 10, fontFamily: "monospace" }}>SKU {selected.sku}</div>}
                  </div>
                  <button onClick={() => setSelected(null)} style={{ width: "100%", padding: "13px 18px", borderRadius: 14, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textDim, fontSize: 14, fontWeight: 700 }}>← Check a different match</button>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sales log ────────────────────────────────────────────────────────────

function SalesLogModal({ sales, onVoid, onExportCSV, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: COLORS.bg, zIndex: 300, overflowY: "auto", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>🧾 Sales Log</div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>{sales.length} sale{sales.length !== 1 ? "s" : ""} · synced across all devices</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <IconButton title="Export CSV" onClick={onExportCSV}>⬇️</IconButton>
            <button onClick={onClose} style={{ padding: "0 18px", height: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.panel, color: COLORS.text, fontSize: 14, fontWeight: 700 }}>✕ Close</button>
          </div>
        </div>

        {sales.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 20px", color: COLORS.textFaint }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🧾</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textDim, marginBottom: 6 }}>No sales logged yet</div>
            <div style={{ fontSize: 14 }}>Tap 📷 Sell and snap a photo when something's sold.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sales.map(sale => {
              const t = TYPE_MAP[sale.itemType] || TYPES[0];
              return (
                <div key={sale.id} style={{ display: "flex", gap: 12, alignItems: "center", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
                  {sale.thumbnail ? (
                    <img src={sale.thumbnail} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 10, background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{t.icon}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sale.itemName}</div>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>
                      {sale.quantity} × {money(sale.price)} = <strong style={{ color: COLORS.good }}>{money(sale.total)}</strong>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 2 }}>
                      {new Date(sale.timestamp).toLocaleString()}{sale.soldBy ? ` · Sold by ${sale.soldBy}` : ""}
                    </div>
                  </div>
                  <button onClick={() => onVoid(sale.id)} style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${COLORS.danger}30`, background: COLORS.dangerSoft, color: COLORS.danger, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>↩️ Void</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Partner settlement modal ────────────────────────────────────────────
// Reads each item's/sale's `owner` tag to show, per partner, how much of their
// money is still sitting in unsold stock vs. how much has come back via sales.
// "Shared 50/50" items are split evenly into both partners' totals.

function SettlementModal({ items, sales, onClose }) {
  const totals = useMemo(() => {
    const base = () => ({ stockCost: 0, revenue: 0, cogs: 0 });
    const raw = { sam: base(), bear_umer: base(), shared: base() };
    for (const i of items) {
      if (raw[i.owner]) raw[i.owner].stockCost += i.quantity * (Number(i.cost) || 0);
    }
    for (const s of sales) {
      if (raw[s.owner]) {
        raw[s.owner].revenue += s.total;
        raw[s.owner].cogs += (Number(s.itemCost) || 0) * s.quantity;
      }
    }
    const half = { stockCost: raw.shared.stockCost / 2, revenue: raw.shared.revenue / 2, cogs: raw.shared.cogs / 2 };
    const combine = a => ({ stockCost: a.stockCost + half.stockCost, revenue: a.revenue + half.revenue, cogs: a.cogs + half.cogs });
    const unassignedStock = items.filter(i => !OWNER_MAP[i.owner]).reduce((s, i) => s + i.quantity * (Number(i.cost) || 0), 0);
    return { sam: combine(raw.sam), bear_umer: combine(raw.bear_umer), unassignedStock };
  }, [items, sales]);

  const Row = ({ label, icon, data }) => {
    const profit = data.revenue - data.cogs;
    const tile = (tileLabel, value, color) => (
      <div style={{ flex: "1 1 140px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.4 }}>{tileLabel}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color }}>{money(value)}</div>
      </div>
    );
    return (
      <div style={{ border: `1.5px solid ${COLORS.border}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.text, marginBottom: 12 }}>{icon} {label}</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {tile("Tied up in stock", data.stockCost, COLORS.amberDark)}
          {tile("Recovered from sales", data.revenue, COLORS.info)}
          {tile("Profit so far", profit, profit >= 0 ? COLORS.good : COLORS.danger)}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(43,27,18,0.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: COLORS.panel,
        borderRadius: "24px 24px 0 0", padding: "22px 22px 32px", boxShadow: "0 -10px 40px rgba(43,27,18,0.2)",
      }}>
        <div style={{ width: 40, height: 4, background: COLORS.border, borderRadius: 2, margin: "0 auto 18px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text }}>🤝 Partner Settlement</div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: COLORS.bg, fontSize: 16 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: COLORS.textDim, marginBottom: 18, lineHeight: 1.5 }}>
          "Tied up in stock" is what each partner spent that's still sitting unsold on the shelf. "Recovered" is total sale revenue from items they funded. Items tagged Shared 50/50 are split evenly into both totals below.
        </div>
        <Row label="Sam" icon="🧔" data={totals.sam} />
        <Row label="Bear/Umer" icon="🐻" data={totals.bear_umer} />
        {totals.unassignedStock > 0 && (
          <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4, lineHeight: 1.5 }}>
            ⚠️ {money(totals.unassignedStock)} of stock cost isn't tagged to an owner yet — open those items and set Owner to Sam, Bear/Umer, or Shared to include them here.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main app ─────────────────────────────────────────────────────────────

export default function BBInventory() {
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeType, setActiveType] = useState("all");
  const [activeGame, setActiveGame] = useState("all");
  const [activeOwner, setActiveOwner] = useState("all");
  const [sortBy, setSortBy] = useState("low-stock");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [showSalesLog, setShowSalesLog] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanBanner, setScanBanner] = useState("");
  const importRef = useRef();
  const scanRef = useRef();
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  // Ids with a quantity change we've made locally but haven't finished syncing yet.
  // Realtime echoes for these ids are ignored until the sync lands, so a slow/out-of-order
  // response from an earlier tap can't overwrite a newer tap's optimistic value on screen.
  const dirtyQtyIds = useRef(new Set());
  const qtyDebounce = useRef({});

  useEffect(() => {
    if (!supabase) { setLoaded(true); return; }
    let active = true;

    (async () => {
      try {
        const [itemsRes, salesRes] = await Promise.all([
          supabase.from("items").select("*"),
          supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(MAX_SALES),
        ]);
        if (!active) return;
        if (!itemsRes.error) setItems((itemsRes.data || []).map(itemFromRow));
        if (!salesRes.error) setSales((salesRes.data || []).map(saleFromRow));
      } catch (err) {
        console.error("Failed to load inventory from Supabase", err);
      } finally {
        if (active) setLoaded(true);
      }
    })();

    const itemsChannel = supabase.channel("items-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, payload => {
        setItems(prev => {
          if (payload.eventType === "DELETE") return prev.filter(i => i.id !== payload.old.id);
          const updated = itemFromRow(payload.new);
          if (dirtyQtyIds.current.has(updated.id)) return prev;
          const idx = prev.findIndex(i => i.id === updated.id);
          if (idx === -1) return [...prev, updated];
          const next = [...prev]; next[idx] = updated; return next;
        });
      })
      .subscribe();

    const salesChannel = supabase.channel("sales-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, payload => {
        setSales(prev => {
          if (payload.eventType === "DELETE") return prev.filter(s => s.id !== payload.old.id);
          const updated = saleFromRow(payload.new);
          const idx = prev.findIndex(s => s.id === updated.id);
          if (idx === -1) return [updated, ...prev].sort((a, b) => b.timestamp - a.timestamp);
          const next = [...prev]; next[idx] = updated; return next;
        });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(salesChannel);
    };
  }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (activeType !== "all") list = list.filter(i => i.type === activeType);
    if (activeGame !== "all") list = list.filter(i => inferGame(i) === activeGame);
    if (activeOwner !== "all") {
      list = activeOwner === "unassigned" ? list.filter(i => !OWNER_MAP[i.owner]) : list.filter(i => i.owner === activeOwner);
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(i => (i.name + " " + i.set + " " + i.sku).toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "name-asc": return a.name.localeCompare(b.name);
        case "name-desc": return b.name.localeCompare(a.name);
        case "price-desc": return (Number(b.price) || 0) - (Number(a.price) || 0);
        case "price-asc": return (Number(a.price) || 0) - (Number(b.price) || 0);
        case "qty-desc": return b.quantity - a.quantity;
        case "qty-asc": return a.quantity - b.quantity;
        case "low-stock":
        default: {
          const aLow = a.lowStock > 0 && a.quantity <= a.lowStock;
          const bLow = b.lowStock > 0 && b.quantity <= b.lowStock;
          if (aLow !== bLow) return aLow ? -1 : 1;
          return a.name.localeCompare(b.name);
        }
      }
    });
  }, [items, activeType, activeGame, activeOwner, sortBy, search]);

  const stats = useMemo(() => {
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    const retailValue = items.reduce((s, i) => s + i.quantity * (Number(i.price) || 0), 0);
    const costValue = items.reduce((s, i) => s + i.quantity * (Number(i.cost) || 0), 0);
    const lowStockCount = items.filter(i => i.lowStock > 0 && i.quantity <= i.lowStock).length;
    return { totalUnits, retailValue, costValue, profit: retailValue - costValue, lowStockCount };
  }, [items]);

  const typeCounts = useMemo(() => {
    const c = { all: items.length };
    for (const t of TYPES) c[t.id] = items.filter(i => i.type === t.id).length;
    return c;
  }, [items]);

  const gameCounts = useMemo(() => {
    const c = { all: items.length };
    for (const g of GAMES) c[g.id] = 0;
    for (const i of items) c[inferGame(i)]++;
    return c;
  }, [items]);

  const ownerCounts = useMemo(() => {
    const c = { all: items.length, unassigned: 0 };
    for (const o of OWNERS) c[o.id] = 0;
    for (const i of items) {
      if (OWNER_MAP[i.owner]) c[i.owner]++; else c.unassigned++;
    }
    return c;
  }, [items]);

  const todaySales = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const list = sales.filter(s => s.timestamp >= start.getTime());
    return { units: list.reduce((s, x) => s + x.quantity, 0), total: list.reduce((s, x) => s + x.total, 0) };
  }, [sales]);

  function openAdd(type = "box") { setDraft(emptyDraft(type)); setScanBanner(""); setIsNew(true); }
  function openEdit(item) { setDraft({ ...item, game: item.game || inferGame(item), cost: item.cost ?? "", price: item.price ?? "" }); setScanBanner(""); setIsNew(false); }
  function closeModal() { setDraft(null); setScanBanner(""); }

  async function handleScanFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    const dataUrl = await readUprightDataUrl(file);
    let extracted = null;
    try {
      const base64 = await toJpegBase64(dataUrl);
      const resp = await fetch("/api/scan-item", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 }),
      });
      extracted = await resp.json().catch(() => null);
    } catch { extracted = null; }

    const photo = await toItemPhoto(dataUrl);
    const type = extracted?.type && TYPE_MAP[extracted.type] ? extracted.type : "single";
    const base = emptyDraft(type);
    const gotFields = extracted && extracted.aiAvailable !== false && (extracted.name || extracted.set);

    setDraft({
      ...base,
      type,
      game: extracted?.game && GAME_MAP[extracted.game] ? extracted.game : "",
      name: extracted?.name || "",
      set: extracted?.set || "",
      condition: extracted?.condition || base.condition,
      notes: extracted?.notes || "",
      photo,
    });

    if (!extracted || extracted.aiAvailable === false) {
      setScanBanner("📷 Photo attached. AI reading isn't configured for this shop yet — fill in the details below.");
    } else if (!gotFields || (extracted.confidence ?? 0) < 0.4) {
      setScanBanner("📷 Photo attached, but the scan wasn't confident — please check the details below carefully.");
    } else {
      setScanBanner("✨ Auto-filled from the photo — double-check before saving, especially price and quantity.");
    }
    setIsNew(true);
    setScanning(false);
  }

  async function saveDraft() {
    const clean = {
      ...draft,
      name: draft.name.trim(),
      set: draft.set.trim(),
      sku: draft.sku.trim(),
      notes: draft.notes.trim(),
      quantity: clampQty(draft.quantity),
      cost: Number(draft.cost) || 0,
      price: Number(draft.price) || 0,
      lowStock: clampQty(draft.lowStock),
    };
    if (isNew) {
      const withId = { ...clean, id: uid() };
      setItems(prev => [...prev, withId]);
      closeModal();
      const { error } = await supabase.from("items").insert(itemToRow(withId));
      if (error) { alert("Couldn't save to the database: " + error.message); setItems(prev => prev.filter(i => i.id !== withId.id)); }
    } else {
      setItems(prev => prev.map(i => (i.id === clean.id ? clean : i)));
      closeModal();
      const { error } = await supabase.from("items").update(itemToRow(clean)).eq("id", clean.id);
      if (error) alert("Couldn't save changes to the database: " + error.message);
    }
  }

  async function deleteDraft() {
    if (!draft?.id) return;
    if (!window.confirm(`Delete "${draft.name || "this item"}" from inventory?`)) return;
    const id = draft.id;
    setItems(prev => prev.filter(i => i.id !== id));
    closeModal();
    const { error } = await supabase.from("items").delete().eq("id", id);
    if (error) alert("Couldn't delete from the database: " + error.message);
  }

  const adjustQty = useCallback((id, delta) => {
    // Update on-screen immediately, but only send ONE write to the database per burst of
    // taps (after a short pause), using whatever quantity the user landed on. Sending a
    // request per tap lets slow/out-of-order responses stomp on faster ones mid-burst.
    dirtyQtyIds.current.add(id);
    setItems(prev => prev.map(i => (i.id === id ? { ...i, quantity: clampQty(i.quantity + delta) } : i)));

    clearTimeout(qtyDebounce.current[id]);
    qtyDebounce.current[id] = setTimeout(async () => {
      delete qtyDebounce.current[id];
      const item = itemsRef.current.find(i => i.id === id);
      if (item) {
        const { error } = await supabase.from("items").update({ quantity: item.quantity }).eq("id", id);
        if (error) console.error("Failed to sync quantity:", error.message);
      }
      dirtyQtyIds.current.delete(id);
    }, 500);
  }, []);

  function exportJSON() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bb-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const cols = ["type", "game", "owner", "name", "set", "condition", "sku", "quantity", "cost", "price", "lowStock", "notes"];
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(",")].concat(items.map(i => cols.map(c => {
      if (c === "game") return esc(GAME_MAP[inferGame(i)].label);
      if (c === "owner") return esc(OWNER_MAP[i.owner]?.label || "");
      return esc(i[c]);
    }).join(",")));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bb-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleConfirmSale({ item, qty, price, soldBy, photoDataUrl }) {
    const newQty = clampQty(item.quantity - qty);
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, quantity: newQty } : i)));
    const thumbnail = photoDataUrl ? await toThumbnail(photoDataUrl) : null;
    const sale = {
      id: uid(), timestamp: Date.now(), itemId: item.id, itemName: item.name, itemSet: item.set, itemType: item.type,
      owner: item.owner || "", itemCost: Number(item.cost) || 0,
      quantity: qty, price, total: price * qty, soldBy, thumbnail,
    };
    setSales(prev => [sale, ...prev].slice(0, MAX_SALES));
    setShowSell(false);
    const [itemRes, saleRes] = await Promise.all([
      supabase.from("items").update({ quantity: newQty }).eq("id", item.id),
      supabase.from("sales").insert(saleToRow(sale)),
    ]);
    if (itemRes.error || saleRes.error) alert("Sale saved on screen but failed to sync to the database — check your connection and try again if it doesn't show up elsewhere.");
  }

  async function voidSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    if (!window.confirm(`Void this sale (${sale.quantity} × ${sale.itemName}) and restore the stock?`)) return;
    setSales(prev => prev.filter(s => s.id !== saleId));
    const item = items.find(i => i.id === sale.itemId);
    const newQty = item ? clampQty(item.quantity + sale.quantity) : null;
    if (item) setItems(prev => prev.map(i => (i.id === sale.itemId ? { ...i, quantity: newQty } : i)));
    await supabase.from("sales").delete().eq("id", saleId);
    if (item) await supabase.from("items").update({ quantity: newQty }).eq("id", sale.itemId);
  }

  function exportSalesCSV() {
    const cols = ["timestamp", "itemName", "itemSet", "itemType", "owner", "quantity", "price", "total", "soldBy"];
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(",")].concat(sales.map(s => cols.map(c => {
      if (c === "timestamp") return esc(new Date(s.timestamp).toLocaleString());
      if (c === "owner") return esc(OWNER_MAP[s.owner]?.label || "");
      return esc(s[c]);
    }).join(",")));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bb-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        if (!window.confirm(`Import ${parsed.length} item(s) and add them to your current inventory?`)) return;
        const imported = parsed.map(p => ({ ...emptyDraft(p.type || "box"), ...p, id: uid() }));
        setItems(prev => [...prev, ...imported]);
        const { error } = await supabase.from("items").insert(imported.map(itemToRow));
        if (error) alert("Import showed up on screen but failed to save to the database: " + error.message);
      } catch {
        alert("Could not read that file. Make sure it's a BB Inventory JSON backup.");
      }
    };
    reader.readAsText(file);
  }

  if (!supabase) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>🐻</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Database not connected</div>
          <div style={{ fontSize: 14, color: COLORS.textDim, lineHeight: 1.6 }}>
            This deployment is missing its Supabase environment variables (<code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>). Add them in your hosting provider's project settings and redeploy.
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🐻</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textDim }}>Loading inventory…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", paddingBottom: 60 }}>
      <style>{`
        * { box-sizing: border-box; }
        button { cursor: pointer; font-family: inherit; }
        input, textarea { font-family: inherit; }
        input:focus, textarea:focus { outline: 2px solid ${COLORS.amber}55; }
        input::placeholder, textarea::placeholder { color: ${COLORS.textFaint}; }
      `}</style>

      {draft && (
        <ItemModal draft={draft} onChange={setDraft} onSave={saveDraft} onDelete={deleteDraft} onClose={closeModal} isNew={isNew} banner={scanBanner} />
      )}
      {showSell && (
        <SellModal items={items} onConfirm={handleConfirmSale} onClose={() => setShowSell(false)} />
      )}
      {showSalesLog && (
        <SalesLogModal sales={sales} onVoid={voidSale} onExportCSV={exportSalesCSV} onClose={() => setShowSalesLog(false)} />
      )}
      {showSettlement && (
        <SettlementModal items={items} sales={sales} onClose={() => setShowSettlement(false)} />
      )}
      {showPriceCheck && (
        <PriceCheckModal items={items} onClose={() => setShowPriceCheck(false)} />
      )}
      {scanning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(43,27,18,0.55)", zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: COLORS.panel, borderRadius: 20, padding: "32px 40px", textAlign: "center", boxShadow: "0 10px 40px rgba(43,27,18,0.3)" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.text }}>Reading item…</div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 4 }}>This takes a few seconds</div>
          </div>
        </div>
      )}
      <input ref={importRef} type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />
      <input ref={scanRef} type="file" accept="image/*" capture="environment" onChange={handleScanFile} style={{ display: "none" }} />

      {/* Header */}
      <div style={{ padding: "22px 20px 16px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 42, lineHeight: 1 }}>🐻</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 0.5, color: COLORS.text }}>BB Inventory</div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: COLORS.amber, textTransform: "uppercase" }}>Bearded Bear Trading Cards</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <IconButton title="Export CSV" onClick={exportCSV}>⬇️</IconButton>
            <IconButton title="Export JSON backup" onClick={exportJSON}>💾</IconButton>
            <IconButton title="Import JSON backup" onClick={() => importRef.current?.click()}>⬆️</IconButton>
            <IconButton title="Sales log" onClick={() => setShowSalesLog(true)}>🧾</IconButton>
            <IconButton title="Partner settlement" onClick={() => setShowSettlement(true)}>🤝</IconButton>
            <IconButton title="Price check" onClick={() => setShowPriceCheck(true)}>💲</IconButton>
            <button onClick={() => setShowSell(true)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "0 18px", height: 44, borderRadius: 12,
              background: COLORS.good, border: "none", color: "#fff", fontSize: 15, fontWeight: 800,
              boxShadow: "0 2px 8px rgba(91,123,74,0.3)",
            }}>📷 Sell</button>
            <button onClick={() => scanRef.current?.click()} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "0 18px", height: 44, borderRadius: 12,
              background: COLORS.info, border: "none", color: "#fff", fontSize: 15, fontWeight: 800,
              boxShadow: "0 2px 8px rgba(62,107,138,0.3)",
            }}>📷 Scan to Add</button>
            <button onClick={() => openAdd(activeType !== "all" ? activeType : "box")} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "0 20px", height: 44, borderRadius: 12,
              background: COLORS.amber, border: "none", color: "#fff", fontSize: 15, fontWeight: 800,
              boxShadow: "0 2px 8px rgba(181,101,29,0.3)",
            }}>+ Add Item</button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: "0 20px 16px", maxWidth: 1100, margin: "0 auto", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatTile label="Units on hand" value={stats.totalUnits} />
        <StatTile label="Retail value" value={money(stats.retailValue)} accent={COLORS.amber} />
        <StatTile label="Potential profit" value={money(stats.profit)} sub={`Cost basis ${money(stats.costValue)}`} accent={COLORS.good} />
        <StatTile label="Low stock" value={stats.lowStockCount} accent={stats.lowStockCount > 0 ? COLORS.danger : COLORS.text} />
        <StatTile label="Sold today" value={money(todaySales.total)} sub={`${todaySales.units} unit${todaySales.units !== 1 ? "s" : ""}`} accent={COLORS.good} />
      </div>

      {/* Filters */}
      <div style={{ padding: "0 20px 10px", maxWidth: 1100, margin: "0 auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by name, set, or SKU…"
          style={{ flex: "1 1 220px", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 15, background: COLORS.panel, color: COLORS.text }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
          flex: "0 0 auto", padding: "13px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`,
          fontSize: 14, fontWeight: 700, background: COLORS.panel, color: COLORS.text, fontFamily: "inherit",
        }}>
          {SORTS.map(s => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
        </select>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[{ id: "all", label: "All", icon: "🗂️" }, ...TYPES].map(t => (
            <button key={t.id} onClick={() => setActiveType(t.id)} style={{
              padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700,
              background: activeType === t.id ? COLORS.amberSoft : COLORS.panel,
              border: `1.5px solid ${activeType === t.id ? COLORS.amber + "70" : COLORS.border}`,
              color: activeType === t.id ? COLORS.amberDark : COLORS.textDim,
            }}>{t.icon} {t.label} ({typeCounts[t.id] ?? 0})</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 20px 18px", maxWidth: 1100, margin: "0 auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[{ id: "all", label: "All Games", icon: "🗂️" }, ...GAMES].map(g => (
          <button key={g.id} onClick={() => setActiveGame(g.id)} style={{
            padding: "9px 13px", borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: activeGame === g.id ? COLORS.amberSoft : COLORS.panel,
            border: `1.5px solid ${activeGame === g.id ? COLORS.amber + "70" : COLORS.border}`,
            color: activeGame === g.id ? COLORS.amberDark : COLORS.textFaint,
          }}>{g.icon} {g.label} ({gameCounts[g.id] ?? 0})</button>
        ))}
      </div>

      <div style={{ padding: "0 20px 18px", maxWidth: 1100, margin: "0 auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {[{ id: "all", label: "All Owners", icon: "🗂️" }, ...OWNERS, { id: "unassigned", label: "Unassigned", icon: "❔" }].map(o => (
          <button key={o.id} onClick={() => setActiveOwner(o.id)} style={{
            padding: "9px 13px", borderRadius: 10, fontSize: 12, fontWeight: 700,
            background: activeOwner === o.id ? COLORS.infoSoft : COLORS.panel,
            border: `1.5px solid ${activeOwner === o.id ? COLORS.info + "70" : COLORS.border}`,
            color: activeOwner === o.id ? COLORS.info : COLORS.textFaint,
          }}>{o.icon} {o.label} ({ownerCounts[o.id] ?? 0})</button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ padding: "0 20px", maxWidth: 1100, margin: "0 auto" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 20px", color: COLORS.textFaint }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>🐻</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.textDim, marginBottom: 6 }}>
              {items.length === 0 ? "No inventory yet" : "No items match"}
            </div>
            <div style={{ fontSize: 14, marginBottom: 18 }}>
              {items.length === 0 ? "Add your first box, pack, or single to get started." : "Try a different search or category."}
            </div>
            {items.length === 0 && (
              <button onClick={() => openAdd("box")} style={{
                padding: "13px 24px", borderRadius: 12, background: COLORS.amber, border: "none",
                color: "#fff", fontSize: 15, fontWeight: 800,
              }}>+ Add Item</button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {filtered.map(item => (
              <ItemCard key={item.id} item={item} onAdjust={adjustQty} onOpen={openEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
