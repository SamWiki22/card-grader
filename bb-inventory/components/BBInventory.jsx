import { useState, useEffect, useMemo, useRef, useCallback } from "react";

// ── Data / constants ──────────────────────────────────────────────────────

const STORAGE_KEY = "bb-inventory-items-v1";
const SALES_KEY = "bb-inventory-sales-v1";
const LAST_SOLD_BY_KEY = "bb-inventory-last-sold-by";
const MAX_SALES = 300;

const TYPES = [
  { id: "box", label: "Boxes", singular: "Box", icon: "📦", color: "#B5651D" },
  { id: "pack", label: "Packs", singular: "Pack", icon: "🎁", color: "#C77B34" },
  { id: "single", label: "Singles", singular: "Single", icon: "🃏", color: "#5B7B4A" },
];
const TYPE_MAP = Object.fromEntries(TYPES.map(t => [t.id, t]));

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"];

const DEFAULT_LOW_STOCK = 2;

function loadItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function saveItems(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function money(n) { return "$" + (Number(n) || 0).toFixed(2); }
function clampQty(n) { return Math.max(0, Math.round(Number(n) || 0)); }

function loadSales() {
  try {
    const raw = JSON.parse(localStorage.getItem(SALES_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function saveSales(sales) {
  try { localStorage.setItem(SALES_KEY, JSON.stringify(sales.slice(0, MAX_SALES))); } catch {}
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
          <Badge color={t.color} soft={t.color + "14"}>{t.icon} {t.singular}</Badge>
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

function ItemModal({ draft, onChange, onSave, onDelete, onClose, isNew }) {
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

  function handlePhotoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    const reader = new FileReader();
    reader.onload = async evt => {
      const compressed = await toItemPhoto(evt.target.result);
      onChange({ ...draft, photo: compressed });
      setPhotoBusy(false);
    };
    reader.onerror = () => setPhotoBusy(false);
    reader.readAsDataURL(file);
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
    const reader = new FileReader();
    reader.onload = async evt => {
      const dataUrl = evt.target.result;
      setPhotoDataUrl(dataUrl);
      setStatus("identifying");
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
    };
    reader.readAsDataURL(file);
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

// ── Sales log ────────────────────────────────────────────────────────────

function SalesLogModal({ sales, onVoid, onExportCSV, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: COLORS.bg, zIndex: 300, overflowY: "auto", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text }}>🧾 Sales Log</div>
            <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2 }}>{sales.length} sale{sales.length !== 1 ? "s" : ""} · stored on this device</div>
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

// ── Main app ─────────────────────────────────────────────────────────────

export default function BBInventory() {
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeType, setActiveType] = useState("all");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [showSalesLog, setShowSalesLog] = useState(false);
  const importRef = useRef();

  useEffect(() => { setItems(loadItems()); setSales(loadSales()); setLoaded(true); }, []);
  useEffect(() => { if (loaded) saveItems(items); }, [items, loaded]);
  useEffect(() => { if (loaded) saveSales(sales); }, [sales, loaded]);

  const filtered = useMemo(() => {
    let list = items;
    if (activeType !== "all") list = list.filter(i => i.type === activeType);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(i => (i.name + " " + i.set + " " + i.sku).toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const aLow = a.lowStock > 0 && a.quantity <= a.lowStock;
      const bLow = b.lowStock > 0 && b.quantity <= b.lowStock;
      if (aLow !== bLow) return aLow ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [items, activeType, search]);

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

  const todaySales = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const list = sales.filter(s => s.timestamp >= start.getTime());
    return { units: list.reduce((s, x) => s + x.quantity, 0), total: list.reduce((s, x) => s + x.total, 0) };
  }, [sales]);

  function openAdd(type = "box") { setDraft(emptyDraft(type)); setIsNew(true); }
  function openEdit(item) { setDraft({ ...item, cost: item.cost ?? "", price: item.price ?? "" }); setIsNew(false); }
  function closeModal() { setDraft(null); }

  function saveDraft() {
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
      updatedAt: Date.now(),
    };
    if (isNew) {
      setItems(prev => [...prev, { ...clean, id: uid(), createdAt: Date.now() }]);
    } else {
      setItems(prev => prev.map(i => (i.id === clean.id ? clean : i)));
    }
    closeModal();
  }

  function deleteDraft() {
    if (!draft?.id) return;
    if (!window.confirm(`Delete "${draft.name || "this item"}" from inventory?`)) return;
    setItems(prev => prev.filter(i => i.id !== draft.id));
    closeModal();
  }

  const adjustQty = useCallback((id, delta) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, quantity: clampQty(i.quantity + delta), updatedAt: Date.now() } : i)));
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
    const cols = ["type", "name", "set", "condition", "sku", "quantity", "cost", "price", "lowStock", "notes"];
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(",")].concat(items.map(i => cols.map(c => esc(i[c])).join(",")));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bb-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleConfirmSale({ item, qty, price, soldBy, photoDataUrl }) {
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, quantity: clampQty(i.quantity - qty), updatedAt: Date.now() } : i)));
    const thumbnail = photoDataUrl ? await toThumbnail(photoDataUrl) : null;
    const sale = {
      id: uid(), timestamp: Date.now(), itemId: item.id, itemName: item.name, itemSet: item.set, itemType: item.type,
      quantity: qty, price, total: price * qty, soldBy, thumbnail,
    };
    setSales(prev => [sale, ...prev].slice(0, MAX_SALES));
    setShowSell(false);
  }

  function voidSale(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    if (!window.confirm(`Void this sale (${sale.quantity} × ${sale.itemName}) and restore the stock?`)) return;
    setSales(prev => prev.filter(s => s.id !== saleId));
    setItems(prev => prev.map(i => (i.id === sale.itemId ? { ...i, quantity: clampQty(i.quantity + sale.quantity), updatedAt: Date.now() } : i)));
  }

  function exportSalesCSV() {
    const cols = ["timestamp", "itemName", "itemSet", "itemType", "quantity", "price", "total", "soldBy"];
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(",")].concat(sales.map(s => cols.map(c => esc(c === "timestamp" ? new Date(s.timestamp).toLocaleString() : s[c])).join(",")));
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
    reader.onload = evt => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!Array.isArray(parsed)) throw new Error("not an array");
        if (!window.confirm(`Import ${parsed.length} item(s) and add them to your current inventory?`)) return;
        const imported = parsed.map(p => ({ ...emptyDraft(p.type || "box"), ...p, id: uid(), createdAt: Date.now(), updatedAt: Date.now() }));
        setItems(prev => [...prev, ...imported]);
      } catch {
        alert("Could not read that file. Make sure it's a BB Inventory JSON backup.");
      }
    };
    reader.readAsText(file);
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
        <ItemModal draft={draft} onChange={setDraft} onSave={saveDraft} onDelete={deleteDraft} onClose={closeModal} isNew={isNew} />
      )}
      {showSell && (
        <SellModal items={items} onConfirm={handleConfirmSale} onClose={() => setShowSell(false)} />
      )}
      {showSalesLog && (
        <SalesLogModal sales={sales} onVoid={voidSale} onExportCSV={exportSalesCSV} onClose={() => setShowSalesLog(false)} />
      )}
      <input ref={importRef} type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />

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
            <button onClick={() => setShowSell(true)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "0 18px", height: 44, borderRadius: 12,
              background: COLORS.good, border: "none", color: "#fff", fontSize: 15, fontWeight: 800,
              boxShadow: "0 2px 8px rgba(91,123,74,0.3)",
            }}>📷 Sell</button>
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
      <div style={{ padding: "0 20px 18px", maxWidth: 1100, margin: "0 auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by name, set, or SKU…"
          style={{ flex: "1 1 220px", padding: "13px 16px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, fontSize: 15, background: COLORS.panel, color: COLORS.text }} />
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
