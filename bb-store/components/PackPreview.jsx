import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { GAME_LABEL, centsToMoney } from "../lib/shared";

// "Top pulls" image for a pack: the pool's best cards with their photos and
// values, branded, sized for Instagram. Drawn in the browser, then shared
// (phone share sheet → Instagram, Messages, Save Image) or downloaded.
const FORMATS = {
  post: { w: 1080, h: 1350, label: "Post" },
  story: { w: 1080, h: 1920, label: "Story" },
  square: { w: 1080, h: 1080, label: "Square" },
};
const MAX_PICK = 9;
const CARD_RATIO = 63 / 88; // width ÷ height of a trading card

const loadImg = src => new Promise(resolve => {
  const img = new Image();
  img.onload = () => resolve(img.naturalWidth ? img : null);
  img.onerror = () => resolve(null);
  img.src = src;
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fit text into `maxLines` lines of `width`, ending with … if it doesn't fit.
function wrap(ctx, text, width, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (let k = 0; k < words.length; k++) {
    const test = line ? `${line} ${words[k]}` : words[k];
    if (ctx.measureText(test).width <= width || !line) { line = test; continue; }
    lines.push(line);
    line = words[k];
    if (lines.length === maxLines) { line = ""; lines[maxLines - 1] += " " + words.slice(k).join(" "); break; }
  }
  if (line) lines.push(line);
  const out = lines.slice(0, maxLines);
  const last = out.length - 1;
  if (last >= 0 && ctx.measureText(out[last]).width > width) {
    let s = out[last];
    while (s.length > 1 && ctx.measureText(s + "…").width > width) s = s.slice(0, -1);
    out[last] = s.trimEnd() + "…";
  }
  return out;
}

function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = parseInt(m ? m[1] : "4fc3b6", 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

async function draw(canvas, { tier, cards, format, showValues, host }) {
  const { w: W, h: H } = FORMATS[format];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const accent = tier.color || "#4fc3b6";
  await Promise.all([
    document.fonts?.load('700 80px "Space Grotesk"'),
    document.fonts?.load('600 30px "Inter"'),
    document.fonts?.load('600 24px "JetBrains Mono"'),
  ].filter(Boolean)).catch(() => {});
  const [logo, ...photos] = await Promise.all([
    loadImg("/logo.png"),
    ...cards.map(c => loadImg(`/api/pack-photo/${encodeURIComponent(c.id)}?inline=1${c.updated_at ? `&v=${encodeURIComponent(c.updated_at)}` : ""}`)),
  ]);

  // Background: deep navy, a glow in the pack's color, faint foil streaks.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d1830"); bg.addColorStop(1, "#050912");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.08, 0, W / 2, H * 0.08, W * 0.9);
  glow.addColorStop(0, hexA(accent, 0.38)); glow.addColorStop(1, hexA(accent, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.05; ctx.fillStyle = "#ffffff";
  for (let k = -2; k < 7; k++) { ctx.beginPath(); ctx.moveTo(k * 220, 0); ctx.lineTo(k * 220 + 90, 0); ctx.lineTo(k * 220 + 90 - H * 0.5, H); ctx.lineTo(k * 220 - H * 0.5, H); ctx.fill(); }
  ctx.restore();

  const pad = 64;
  const sq = format === "square";
  let y = format === "story" ? 150 : sq ? 50 : 70;

  // Header: logo + shop name, then the pack.
  const logoH = sq ? 64 : 88;
  if (logo) ctx.drawImage(logo, pad, y, logoH * (logo.width / logo.height), logoH);
  ctx.fillStyle = "rgba(238,243,251,.75)";
  ctx.font = '600 24px "JetBrains Mono", monospace';
  ctx.textBaseline = "middle";
  ctx.fillText("BEARDED BEAR TCG", pad + (logo ? logoH * (logo.width / logo.height) + 20 : 0), y + logoH / 2);
  y += logoH + (sq ? 20 : 34);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#eef3fb";
  const titleSize = sq ? 60 : 76;
  ctx.font = `700 ${titleSize}px "Space Grotesk", sans-serif`;
  const title = `${GAME_LABEL[tier.game] || ""} ${tier.name}`.trim();
  for (const line of wrap(ctx, title, W - pad * 2, 2)) { y += titleSize; ctx.fillText(line, pad, y); }
  y += sq ? 46 : 52;
  ctx.font = '700 36px "Space Grotesk", sans-serif';
  ctx.fillStyle = accent;
  ctx.fillText(`${centsToMoney(tier.price_cents)} pack · top pulls`, pad, y);
  y += 44;

  // Footer.
  const footerH = format === "story" ? 230 : sq ? 120 : 130;
  const footY = H - footerH;
  ctx.fillStyle = "#eef3fb";
  ctx.font = '700 38px "Space Grotesk", sans-serif';
  ctx.fillText(`Rip one at ${host}/packs`, pad, footY + 56);
  ctx.fillStyle = "rgba(238,243,251,.6)";
  ctx.font = '500 24px "Inter", sans-serif';
  ctx.fillText("Every pull is a real card · Odds posted live · 18+", pad, footY + 98);

  // Card grid, sized to fill the space between header and footer.
  const n = cards.length;
  if (!n) return;
  const gap = 28;
  const textH = showValues ? 104 : 64;
  const areaTop = y + 10, areaH = footY - areaTop - 20;
  // Try every column count and keep the one that makes the cards biggest.
  const fit = c => {
    const r = Math.ceil(n / c);
    return Math.min((W - pad * 2 - gap * (c - 1)) / c, ((areaH - gap * (r - 1)) / r - textH) * CARD_RATIO);
  };
  let cols = 1;
  for (let c = 2; c <= Math.min(n, 5); c++) if (fit(c) > fit(cols) + 1) cols = c;
  const rows = Math.ceil(n / cols);
  const cellW = fit(cols);
  const imgH = cellW / CARD_RATIO;
  const gridW = cellW * cols + gap * (cols - 1);
  const gridH = (imgH + textH) * rows + gap * (rows - 1);
  const x0 = (W - gridW) / 2, y0 = areaTop + Math.max(0, (areaH - gridH) / 2);
  const radius = Math.max(10, cellW * 0.05);
  const nameSize = Math.round(Math.min(30, Math.max(20, cellW * 0.085)));
  const valueSize = Math.round(nameSize * 1.35);

  cards.forEach((c, k) => {
    const row = Math.floor(k / cols);
    // Center a short last row.
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const rowX = x0 + (gridW - (cellW * inRow + gap * (inRow - 1))) / 2;
    const x = rowX + (k % cols) * (cellW + gap);
    const cy = y0 + row * (imgH + textH + gap);

    // Card: glow on the top hit, photo cropped to card shape.
    ctx.save();
    ctx.shadowColor = k === 0 ? hexA(accent, 0.75) : "rgba(0,0,0,.5)";
    ctx.shadowBlur = k === 0 ? 40 : 24;
    roundRect(ctx, x, cy, cellW, imgH, radius);
    ctx.fillStyle = "#0b1426"; ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, cy, cellW, imgH, radius);
    ctx.clip();
    const photo = photos[k];
    if (photo) {
      const s = Math.max(cellW / photo.width, imgH / photo.height);
      ctx.drawImage(photo, x + (cellW - photo.width * s) / 2, cy + (imgH - photo.height * s) / 2, photo.width * s, photo.height * s);
    } else if (logo) {
      const lw = cellW * 0.5;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(logo, x + (cellW - lw) / 2, cy + (imgH - lw * (logo.height / logo.width)) / 2, lw, lw * (logo.height / logo.width));
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    roundRect(ctx, x, cy, cellW, imgH, radius);
    ctx.lineWidth = k === 0 ? 4 : 2;
    ctx.strokeStyle = k === 0 ? accent : "rgba(255,255,255,.18)";
    ctx.stroke();

    // Grade pill.
    if (c.grade) {
      ctx.font = `700 ${Math.round(nameSize * 0.75)}px "JetBrains Mono", monospace`;
      const label = c.grade.toUpperCase();
      const pw = ctx.measureText(label).width + 22, ph = nameSize * 1.25;
      roundRect(ctx, x + 12, cy + 12, Math.min(pw, cellW - 24), ph, ph / 2);
      ctx.fillStyle = "rgba(5,9,18,.82)"; ctx.fill();
      ctx.fillStyle = "#eef3fb"; ctx.textBaseline = "middle";
      ctx.fillText(label, x + 23, cy + 12 + ph / 2, cellW - 46);
      ctx.textBaseline = "alphabetic";
    }

    // Name and value under the card.
    ctx.fillStyle = "rgba(238,243,251,.92)";
    ctx.font = `600 ${nameSize}px "Inter", sans-serif`;
    let ty = cy + imgH + nameSize + 12;
    for (const line of wrap(ctx, c.name, cellW, showValues ? 1 : 2)) { ctx.fillText(line, x, ty); ty += nameSize * 1.2; }
    if (showValues) {
      ctx.fillStyle = k === 0 ? accent : "#eef3fb";
      ctx.font = `700 ${valueSize}px "Space Grotesk", sans-serif`;
      ctx.fillText(centsToMoney(c.market_value_cents), x, ty + valueSize * 0.55);
    }
  });
}

export default function PackPreview({ tier, cards }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("post");
  const [showValues, setShowValues] = useState(true);
  const [picked, setPicked] = useState(null); // ids, in value order
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  // The pool's best cards, one per distinct card (copies collapse).
  const candidates = useMemo(() => {
    const seen = new Set();
    return cards.filter(c => c.status === "available")
      .sort((a, b) => b.market_value_cents - a.market_value_cents)
      .filter(c => { const k = `${c.name}|${c.grade}|${c.market_value_cents}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 18);
  }, [cards]);

  function start() {
    // Default: the top 6, skipping cards without a photo when there are enough with one.
    const withPhoto = candidates.filter(c => c.has_photo);
    const base = withPhoto.length >= 6 ? withPhoto : candidates;
    setPicked(base.slice(0, 6).map(c => c.id));
    setUrl(""); setOpen(true);
  }
  const chosen = useMemo(() => candidates.filter(c => picked?.includes(c.id)), [candidates, picked]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let live = true;
    setBusy(true);
    draw(canvasRef.current, { tier, cards: chosen, format, showValues, host: window.location.host })
      .then(() => { if (live) setUrl(canvasRef.current.toDataURL("image/jpeg", 0.9)); })
      .finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [open, chosen, format, showValues, tier]);

  const toggle = id => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX_PICK ? p : [...p, id]));
  const fileName = `${(GAME_LABEL[tier.game] || "pack").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${tier.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-top-pulls.jpg`;

  async function share() {
    const blob = await new Promise(r => canvasRef.current.toBlob(r, "image/jpeg", 0.9));
    const file = new File([blob], fileName, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `${tier.name} top pulls` }); } catch {}
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  }

  return (
    <>
      <button className="btn btn-small btn-ghost-dark" onClick={start} disabled={!candidates.length}>🖼 Top pulls preview</button>
      {open && (
        <Modal wide title={`Top pulls · ${tier.name}`} onClose={() => setOpen(false)}>
          <div className="pv">
            <div className="pv-opts">
              <div className="pv-seg" role="group" aria-label="Size">
                {Object.entries(FORMATS).map(([k, f]) => (
                  <button key={k} className={format === k ? "on" : ""} onClick={() => setFormat(k)}>{f.label}</button>
                ))}
              </div>
              <label className="check"><input type="checkbox" checked={showValues} onChange={e => setShowValues(e.target.checked)} /> Show values</label>
            </div>

            <div className={`pv-frame pv-${format}`}>
              {url ? <img src={url} alt="Top pulls preview" /> : <span className="muted small">Drawing…</span>}
              {busy && url && <span className="pv-busy">Updating…</span>}
            </div>
            <canvas ref={canvasRef} hidden />

            <div className="pv-actions">
              <button className="btn" onClick={share} disabled={!url || !chosen.length}>Share / Save image</button>
              <span className="muted small">{chosen.length} of {MAX_PICK} cards</span>
            </div>

            <h3 className="bal-h">Cards to show (priciest first)</h3>
            <p className="muted small">Tap to add or remove. The first one gets the glow.</p>
            <div className="pv-pick">
              {candidates.map(c => (
                <button key={c.id} className={`pv-chip${picked.includes(c.id) ? " on" : ""}`} onClick={() => toggle(c.id)}>
                  <span className="pv-chip-name">{c.name}{c.grade ? ` · ${c.grade}` : ""}</span>
                  <span className="pv-chip-meta">{centsToMoney(c.market_value_cents)}{c.has_photo ? "" : " · no photo"}</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
