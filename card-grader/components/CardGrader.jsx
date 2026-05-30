import { useState, useRef, useCallback, useEffect } from "react";

const WEIGHTS = { centering: 0.20, corners: 0.30, edges: 0.25, surface: 0.25 };

const COMPANIES = {
  BGS: {
    name: "Beckett BGS", color: "#FFD700",
    tiers: [
      { min: 9.80, short: "BLACK LABEL", color: "#FFD700", badge: "🏆", likely: "BGS 10 Black Label", verdict: "Near-perfect. Extremely likely BGS 10 Black Label." },
      { min: 9.40, short: "PRISTINE",    color: "#E8E8E8", badge: "💎", likely: "BGS 10 Pristine",    verdict: "Exceptional quality. Strong BGS Pristine 10 candidate." },
      { min: 9.00, short: "GEM MINT",    color: "#64B5F6", badge: "⭐", likely: "BGS 9.5 Gem Mint",   verdict: "Very strong card. Likely BGS 9.5 Gem Mint." },
      { min: 8.50, short: "NM-MT",       color: "#81C784", badge: "✅", likely: "BGS 8–8.5",          verdict: "Solid card with minor flaws. Likely BGS 8 or 8.5." },
      { min: 7.50, short: "NEAR MINT",   color: "#FFB74D", badge: "📋", likely: "BGS 7–7.5",          verdict: "Noticeable wear. Likely BGS 7–7.5." },
      { min: 0,    short: "BELOW NM",    color: "#EF5350", badge: "⚠️", likely: "BGS 6 or lower",     verdict: "Significant defects. Not a premium grade candidate." },
    ],
  },
  PSA: {
    name: "PSA", color: "#E53935",
    tiers: [
      { min: 9.50, short: "GEM MT 10", color: "#FFD700", badge: "🏆", likely: "PSA 10 Gem Mint", verdict: "Near-perfect card. Strong PSA 10 candidate." },
      { min: 9.00, short: "MINT 9",    color: "#E8E8E8", badge: "💎", likely: "PSA 9 Mint",      verdict: "Excellent with minimal flaws. Likely PSA 9." },
      { min: 8.50, short: "NM-MT 8",   color: "#64B5F6", badge: "⭐", likely: "PSA 8 NM-MT",     verdict: "Very nice card. Likely PSA 8." },
      { min: 7.50, short: "NM 7",      color: "#81C784", badge: "✅", likely: "PSA 7 NM",        verdict: "Solid with minor wear. Likely PSA 7." },
      { min: 6.50, short: "EX-MT 6",   color: "#FFB74D", badge: "📋", likely: "PSA 5–6",         verdict: "Noticeable wear. Likely PSA 5 or 6." },
      { min: 0,    short: "BELOW EX",  color: "#EF5350", badge: "⚠️", likely: "PSA 4 or lower",  verdict: "Significant wear or defects. PSA 4 or lower." },
    ],
  },
  SGC: {
    name: "SGC", color: "#1E88E5",
    tiers: [
      { min: 9.70, short: "PRISTINE 10", color: "#FFD700", badge: "🏆", likely: "SGC 10 Pristine", verdict: "Near-flawless. Strong SGC 10 Pristine candidate." },
      { min: 9.20, short: "MINT+ 9.5",  color: "#E8E8E8", badge: "💎", likely: "SGC 9.5 Mint+",   verdict: "Exceptional quality. Likely SGC 9.5 Mint+." },
      { min: 8.80, short: "MINT 9",     color: "#64B5F6", badge: "⭐", likely: "SGC 9 Mint",       verdict: "Very strong card. Likely SGC 9 Mint." },
      { min: 8.00, short: "NM-MT 8",    color: "#81C784", badge: "✅", likely: "SGC 8–8.5",        verdict: "Solid. Likely SGC 8 or 8.5." },
      { min: 7.00, short: "NM 7",       color: "#FFB74D", badge: "📋", likely: "SGC 7–7.5",        verdict: "Noticeable wear. Likely SGC 7–7.5." },
      { min: 0,    short: "BELOW NM",   color: "#EF5350", badge: "⚠️", likely: "SGC 6 or lower",   verdict: "Significant defects. SGC 6 or lower." },
    ],
  },
  TAG: {
    name: "TAG", color: "#43A047",
    tiers: [
      { min: 9.50, short: "PERFECT 10",   color: "#FFD700", badge: "🏆", likely: "TAG 10 Perfect",   verdict: "Near-flawless. Strong TAG 10 candidate." },
      { min: 9.00, short: "GEM MINT 9.5", color: "#E8E8E8", badge: "💎", likely: "TAG 9.5 Gem Mint", verdict: "Exceptional card. Likely TAG 9.5 Gem Mint." },
      { min: 8.50, short: "MINT 9",       color: "#64B5F6", badge: "⭐", likely: "TAG 9 Mint",       verdict: "Very strong card. Likely TAG 9 Mint." },
      { min: 8.00, short: "NM-MT 8.5",    color: "#81C784", badge: "✅", likely: "TAG 8–8.5",        verdict: "Solid with minor wear. Likely TAG 8 or 8.5." },
      { min: 7.00, short: "NEAR MINT",    color: "#FFB74D", badge: "📋", likely: "TAG 7–7.5",        verdict: "Noticeable wear. Likely TAG 7–7.5." },
      { min: 0,    short: "BELOW NM",     color: "#EF5350", badge: "⚠️", likely: "TAG 6 or lower",   verdict: "Significant defects." },
    ],
  },
  CGC: {
    name: "CGC", color: "#AB47BC",
    tiers: [
      { min: 9.70, short: "PRISTINE 10",  color: "#FFD700", badge: "🏆", likely: "CGC 10 Pristine",  verdict: "Flawless. Strong CGC 10 Pristine candidate." },
      { min: 9.20, short: "GEM MINT 9.5", color: "#E8E8E8", badge: "💎", likely: "CGC 9.5 Gem Mint", verdict: "Exceptional quality. Likely CGC 9.5 Gem Mint." },
      { min: 8.80, short: "MINT 9",       color: "#64B5F6", badge: "⭐", likely: "CGC 9 Mint",       verdict: "Very strong card. Likely CGC 9 Mint." },
      { min: 8.20, short: "NM/MT+ 8.5",   color: "#81C784", badge: "✅", likely: "CGC 8.5 NM/MT+",  verdict: "Solid. Likely CGC 8.5." },
      { min: 7.50, short: "NM/MT 8",      color: "#FFB74D", badge: "📋", likely: "CGC 7.5–8",        verdict: "Noticeable wear. Likely CGC 7.5–8." },
      { min: 0,    short: "BELOW NM",     color: "#EF5350", badge: "⚠️", likely: "CGC 7 or lower",   verdict: "Significant defects. CGC 7 or lower." },
    ],
  },
};

const PHOTO_TIPS = [
  { icon: "☀️", title: "Lighting", text: "Natural light or a lamp — no flash. Flash creates glare on holo/foil cards that hides surface defects." },
  { icon: "📐", title: "Angle", text: "Shoot straight down, not at an angle. All 4 borders must be fully visible for accurate centering." },
  { icon: "⬜", title: "Background", text: "Lay the card on a plain white surface. White contrast helps the AI detect edge and corner wear." },
  { icon: "🔍", title: "Distance", text: "Fill ~80% of the frame with the card. Too far = AI misses corner detail. Too close = borders get cut off." },
  { icon: "🎴", title: "Holo Cards", text: "For holo/foil Pokémon cards, tilt slightly until glare disappears before shooting. Glare masks surface defects." },
  { icon: "📸", title: "Focus", text: "Tap to focus on the card before shooting. A blurry photo will produce unreliable grades." },
];

const CATEGORIES = [
  { id: "centering", label: "Centering", icon: "⊞", weight: "20%", prompt: "You are a professional trading card grader. Analyze this card image for centering. Look at the 4 border widths. Score 10=perfect 50/50, 9.5=55/45, 9=60/40, 8=65/35, 7=70/30 or worse. Respond with ONLY a JSON object: {\"score\":8.5,\"leftRight\":\"52/48\",\"topBottom\":\"50/50\",\"verdict\":\"one sentence\",\"defects\":[]}" },
  { id: "surface",   label: "Surface",   icon: "◈", weight: "25%", prompt: "You are a professional trading card grader. Analyze this card image for surface defects: scratches, print lines, cloudiness, stains, indentations, gloss loss. Score 10=flawless, 9.5=only under magnification, 9=very minor, 8=minor visible, 7=moderate. Respond with ONLY a JSON object: {\"score\":9.0,\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}" },
  { id: "corners",   label: "Corners",   icon: "◢", weight: "30%", prompt: "You are a professional trading card grader. Analyze this card image for corner condition: fraying, nicks, rounding, creases, ink wear at tips. Score 10=needle sharp all 4, 9.5=one barely off, 9=minor wear 1-2, 8=soft corners, 7=worn/frayed. Respond with ONLY a JSON object: {\"score\":9.5,\"worstCorner\":\"TR\",\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}" },
  { id: "edges",     label: "Edges",     icon: "▬", weight: "25%", prompt: "You are a professional trading card grader. Analyze this card image for edge condition: chipping, nicks, roughness, whitening, dents. Score 10=razor clean, 9.5=only under magnification, 9=minor nicks, 8=visible chipping, 7=moderate. Respond with ONLY a JSON object: {\"score\":9.0,\"worstEdge\":\"Bottom\",\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}" },
];

const COLLECTION_KEY = "pg-collection";

function loadCollection() {
  try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) || "[]"); }
  catch { return []; }
}

function saveCollection(col) {
  try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(col)); }
  catch { /* storage full */ }
}

function getTier(score, company) {
  const tiers = COMPANIES[company].tiers;
  return tiers.find(t => score >= t.min) || tiers[tiers.length - 1];
}

function calcPGScore(scores) {
  let totalWeight = 0, weightedSum = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    if (scores[key] != null) { weightedSum += scores[key] * weight; totalWeight += weight; }
  }
  return totalWeight === 0 ? null : Math.min(10, weightedSum / totalWeight);
}

function parseResponse(text) {
  if (!text) return { score: 7, verdict: "No response.", defects: [] };
  const first = text.indexOf("{"), last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      const obj = JSON.parse(text.slice(first, last + 1));
      if (typeof obj.score === "number") {
        return {
          score: Math.min(10, Math.max(1, obj.score)),
          verdict: String(obj.verdict || "Analysis complete.").slice(0, 200),
          defects: Array.isArray(obj.defects) ? obj.defects.filter(Boolean) : [],
          leftRight: obj.leftRight || null,
          topBottom: obj.topBottom || null,
        };
      }
    } catch (_) {}
  }
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return { score: m ? Math.min(10, Math.max(1, parseFloat(m[1]))) : 7, verdict: text.slice(0, 150), defects: [] };
}

async function toJpegBase64(dataUrl, maxDim = 1800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function toThumbnail(dataUrl, maxDim = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio); h = Math.round(h * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function analyzeCategory(base64, cat) {
  const resp = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, prompt: cat.prompt }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Analysis failed.");
  }
  const { text } = await resp.json();
  return parseResponse(text);
}

function ScoreRing({ score, size, color }) {
  const sw = 8, r = (size - sw * 2) / 2, circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / 10));
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", display: "block", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }} />
    </svg>
  );
}

function MiniBar({ score, color }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginTop: 6 }}>
      <div style={{ height: "100%", width: `${score / 10 * 100}%`, background: color, borderRadius: 2, transition: "width 1s ease" }} />
    </div>
  );
}

function TipsModal({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ width: "100%", background: "#0f0f1a", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 3, color: "#FFD700" }}>📸 PHOTO GUIDE</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "6px 14px", fontSize: 13 }}>Done</button>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.7, padding: "14px", background: "rgba(255,215,0,0.05)", borderRadius: 10, border: "1px solid rgba(255,215,0,0.15)" }}>
          PG Score analyzes one photo for all 4 subgrades simultaneously. The better your photo, the more accurate the PG Score.
        </div>
        {PHOTO_TIPS.map((tip, i) => (
          <div key={i} style={{ display: "flex", gap: 14, marginBottom: 14, padding: "14px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 22, flexShrink: 0, paddingTop: 2 }}>{tip.icon}</div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 1, color: "#FFD700", marginBottom: 3 }}>{tip.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{tip.text}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: "16px", background: "rgba(255,215,0,0.05)", borderRadius: 12, border: "1px solid rgba(255,215,0,0.2)" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 2, color: "#FFD700", marginBottom: 8 }}>HOW THE SCORE WORKS</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
            AI grades 4 categories: <strong style={{ color: "rgba(255,255,255,0.8)" }}>Corners (30%)</strong>, <strong style={{ color: "rgba(255,255,255,0.8)" }}>Edges (25%)</strong>, <strong style={{ color: "rgba(255,255,255,0.8)" }}>Surface (25%)</strong>, <strong style={{ color: "rgba(255,255,255,0.8)" }}>Centering (20%)</strong>. These are weighted into a PG Score out of 10, then mapped to whichever grading company you selected. This is a pre-grade estimate — actual grades may vary.
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ pgScore, tier, scores, cardName, preview, company, onClose, onSaveToCollection, alreadySaved }) {
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const reportId = useRef("PG-" + Date.now().toString(36).toUpperCase().slice(-6));
  const [savingPdf, setSavingPdf] = useState(false);
  const [saved, setSaved] = useState(alreadySaved);
  const col = tier.color;

  async function handleSavePDF() {
    const el = document.getElementById("pg-report-card");
    if (!el) return;
    setSavingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(el, { backgroundColor: "#0a0a14", scale: 2, useCORS: true, allowTaint: true });
      const imgData = canvas.toDataURL("image/png");
      const pdfW = canvas.width / 2;
      const pdfH = canvas.height / 2;
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [pdfW, pdfH] });
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(`PGScore-${(cardName || "card").replace(/\s+/g, "-")}-${reportId.current}.pdf`);
    } catch (err) {
      alert("PDF export failed. Try using your browser's Print → Save as PDF option.");
    } finally {
      setSavingPdf(false);
    }
  }

  function handleSaveCollection() {
    onSaveToCollection(reportId.current);
    setSaved(true);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 200, overflowY: "auto", padding: "20px 16px 60px" }}>
      <style>{`@media print { body * { visibility: hidden; } #pg-report-card, #pg-report-card * { visibility: visible; } #pg-report-card { position: fixed; top: 0; left: 0; width: 100%; } }`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 3, color: "rgba(255,255,255,0.5)" }}>PG SCORE REPORT</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "7px 16px", fontSize: 13 }}>✕ Close</button>
      </div>

      {/* THE REPORT CARD */}
      <div id="pg-report-card" style={{ background: "#0a0a14", border: `2px solid ${col}50`, borderRadius: 20, overflow: "hidden", maxWidth: 480, margin: "0 auto" }}>

        {/* Header stripe */}
        <div style={{ background: `linear-gradient(135deg, ${col}22 0%, rgba(0,0,0,0.8) 100%)`, padding: "20px 24px 16px", borderBottom: `1px solid ${col}30` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 5, color: col, lineHeight: 1 }}>PG SCORE™</div>
              <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>AI-POWERED PRE-GRADE CERTIFICATE</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>{date}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>{reportId.current}</div>
            </div>
          </div>
        </div>

        {/* Card info + image */}
        <div style={{ padding: "20px 24px", display: "flex", gap: 16, alignItems: "flex-start", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          {preview && (
            <img src={preview} alt="Card" style={{ width: 90, height: 126, objectFit: "contain", borderRadius: 8, border: `1px solid ${col}30`, flexShrink: 0, background: "rgba(255,255,255,0.03)" }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 4 }}>CARD</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#fff", lineHeight: 1.2, marginBottom: 12 }}>{cardName || "Trading Card"}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 4 }}>PREDICTED GRADE</div>
            <div style={{ display: "inline-block", padding: "4px 12px", background: `${col}18`, border: `1px solid ${col}40`, borderRadius: 20 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: col, letterSpacing: 1 }}>{COMPANIES[company].name} · {tier.likely}</span>
            </div>
          </div>
        </div>

        {/* Big Score */}
        <div style={{ padding: "24px", textAlign: "center", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>PG SCORE</div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
            <ScoreRing score={pgScore} size={140} color={col} />
            <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 56, color: col, lineHeight: 1 }}>{pgScore.toFixed(1)}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>OUT OF 10</div>
            </div>
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: col, letterSpacing: 2, marginTop: 12 }}>{tier.badge} {tier.short}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5, maxWidth: 280, margin: "8px auto 0" }}>{tier.verdict}</div>
        </div>

        {/* Subgrades */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.25)", marginBottom: 14 }}>SUBGRADES</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {CATEGORIES.map(c => {
              const s = scores[c.id];
              const scol = s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350";
              return (
                <div key={c.id} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid ${scol}25` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>{c.icon} {c.label.toUpperCase()}</div>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>Weight {c.weight}</div>
                    </div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: scol, lineHeight: 1 }}>{s != null ? s.toFixed(1) : "—"}</div>
                  </div>
                  <MiniBar score={s || 0} color={scol} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", background: "rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", lineHeight: 1.6, textAlign: "center" }}>
            This PG Score is an AI-generated pre-grade estimate. It is not an official grade from PSA, BGS, SGC, TAG, or CGC. Actual graded results may differ. Report ID: {reportId.current}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ maxWidth: 480, margin: "16px auto 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Save PDF */}
        <button
          onClick={handleSavePDF}
          disabled={savingPdf}
          style={{ width: "100%", padding: "16px", borderRadius: 12, background: `linear-gradient(135deg, ${col}20 0%, ${col}08 100%)`, border: `1.5px solid ${col}50`, color: col, fontSize: 15, fontWeight: 700, opacity: savingPdf ? 0.6 : 1 }}>
          {savingPdf ? "⏳ Generating PDF…" : "⬇️ Save as PDF"}
        </button>

        <div style={{ display: "flex", gap: 10 }}>
          {/* Save to Collection */}
          <button
            onClick={handleSaveCollection}
            disabled={saved}
            style={{ flex: 1, padding: "13px", borderRadius: 12, background: saved ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${saved ? "#4CAF5050" : "rgba(255,255,255,0.1)"}`, color: saved ? "#4CAF50" : "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600 }}>
            {saved ? "✅ Saved" : "📁 Save to Collection"}
          </button>
          {/* Copy Report */}
          <button
            onClick={() => {
              const date2 = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
              const text = [
                "PG SCORE™ — AI PRE-GRADE CERTIFICATE",
                "━━━━━━━━━━━━━━━━━━━━━━━━━",
                `Card: ${cardName || "Trading Card"}`,
                `Date: ${date2}  |  ID: ${reportId.current}`,
                "",
                `PG SCORE: ${pgScore.toFixed(1)}/10`,
                `${tier.badge} ${tier.short}`,
                `Predicted: ${COMPANIES[company].name} · ${tier.likely}`,
                "",
                "SUBGRADES",
                `  ◢ Corners   ${scores.corners?.toFixed(1) ?? "—"}/10  (30%)`,
                `  ▬ Edges     ${scores.edges?.toFixed(1) ?? "—"}/10  (25%)`,
                `  ◈ Surface   ${scores.surface?.toFixed(1) ?? "—"}/10  (25%)`,
                `  ⊞ Centering ${scores.centering?.toFixed(1) ?? "—"}/10  (20%)`,
                "",
                `"${tier.verdict}"`,
                "",
                "AI pre-grade estimate. Not an official grade.",
                "#PGScore #CardGrading #TradingCards",
              ].join("\n");
              navigator.clipboard.writeText(text).then(() => alert("Report copied! Paste it anywhere."));
            }}
            style={{ flex: 1, padding: "13px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}>
            📋 Copy Text
          </button>
        </div>
      </div>
      <div style={{ maxWidth: 480, margin: "10px auto 0", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
        PDF saves directly to your device — no account needed
      </div>
    </div>
  );
}

function CollectionModal({ onClose }) {
  const [collection, setCollection] = useState([]);
  const [savingPdf, setSavingPdf] = useState(null);

  useEffect(() => { setCollection(loadCollection()); }, []);

  function deleteCard(id) {
    const updated = collection.filter(c => c.id !== id);
    setCollection(updated);
    saveCollection(updated);
  }

  async function downloadCardPdf(card) {
    setSavingPdf(card.id);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const el = document.getElementById(`collection-card-${card.id}`);
      if (!el) return;
      const canvas = await html2canvas(el, { backgroundColor: "#0a0a14", scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdfW = canvas.width / 2;
      const pdfH = canvas.height / 2;
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [pdfW, pdfH] });
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(`PGScore-${(card.cardName || "card").replace(/\s+/g, "-")}-${card.reportId}.pdf`);
    } catch {
      alert("PDF export failed.");
    } finally {
      setSavingPdf(null);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "#080810", zIndex: 300, overflowY: "auto", padding: "20px 16px 80px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 4, color: "#FFD700" }}>MY COLLECTION</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{collection.length} card{collection.length !== 1 ? "s" : ""} saved to this device</div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "7px 16px", fontSize: 13 }}>✕ Close</button>
      </div>

      {collection.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.2)" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📁</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, marginBottom: 8 }}>NO CARDS YET</div>
          <div style={{ fontSize: 12 }}>Grade a card and tap "Save to Collection" to build your portfolio.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {collection.map(card => {
            const tier = getTier(card.pgScore, card.company);
            const col = tier.color;
            return (
              <div key={card.id}>
                {/* Mini report for PDF capture */}
                <div id={`collection-card-${card.id}`} style={{ background: "#0a0a14", border: `2px solid ${col}50`, borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ background: `linear-gradient(135deg, ${col}18 0%, rgba(0,0,0,0.8) 100%)`, padding: "14px 16px", borderBottom: `1px solid ${col}25` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 4, color: col }}>PG SCORE™</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{card.date} · {card.reportId}</div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "center" }}>
                    {card.thumbnail && (
                      <img src={card.thumbnail} alt="" style={{ width: 56, height: 78, objectFit: "contain", borderRadius: 6, border: `1px solid ${col}25`, flexShrink: 0, background: "rgba(255,255,255,0.02)" }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color: "#fff", marginBottom: 4, lineHeight: 1.2 }}>{card.cardName || "Trading Card"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: col, lineHeight: 1 }}>{card.pgScore.toFixed(1)}</div>
                        <div>
                          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 12, color: col }}>{tier.badge} {tier.short}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{COMPANIES[card.company].name} · {tier.likely}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {CATEGORIES.map(c => {
                          const s = card.scores[c.id];
                          const sc = s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350";
                          return (
                            <div key={c.id} style={{ fontSize: 9, padding: "3px 7px", background: `${sc}12`, border: `1px solid ${sc}30`, borderRadius: 6, color: sc }}>
                              {c.label.slice(0,3).toUpperCase()} {s?.toFixed(1)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action row */}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => downloadCardPdf(card)}
                    disabled={savingPdf === card.id}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, background: `${col}12`, border: `1px solid ${col}35`, color: col, fontSize: 12, fontWeight: 600, opacity: savingPdf === card.id ? 0.6 : 1 }}>
                    {savingPdf === card.id ? "⏳ Saving…" : "⬇️ Save PDF"}
                  </button>
                  <button
                    onClick={() => deleteCard(card.id)}
                    style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(239,83,80,0.06)", border: "1px solid rgba(239,83,80,0.2)", color: "#EF9A9A", fontSize: 12 }}>
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CardGrader() {
  const [company, setCompany]         = useState("BGS");
  const [cardName, setCardName]       = useState("");
  const [preview, setPreview]         = useState(null);
  const [analyzing, setAnalyzing]     = useState(false);
  const [progress, setProgress]       = useState({});
  const [results, setResults]         = useState({});
  const [error, setError]             = useState(null);
  const [showTips, setShowTips]       = useState(false);
  const [showReport, setShowReport]   = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [collectionCount, setCollectionCount] = useState(0);
  const [reportSaved, setReportSaved] = useState(false);
  const cameraRef  = useRef();
  const galleryRef = useRef();

  useEffect(() => { setCollectionCount(loadCollection().length); }, []);

  const rawScores = {
    centering: results.centering?.score ?? null,
    surface:   results.surface?.score   ?? null,
    corners:   results.corners?.score   ?? null,
    edges:     results.edges?.score     ?? null,
  };
  const pgScore = calcPGScore(rawScores);
  const tier = pgScore != null ? getTier(pgScore, company) : null;
  const completedCount = Object.values(rawScores).filter(v => v != null).length;
  const allComplete = completedCount === 4;

  const analyze = useCallback(async (file) => {
    if (!file) return;
    setError(null); setResults({}); setProgress({}); setShowReport(false); setReportSaved(false);
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read file.");
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setPreview(dataUrl);
      setAnalyzing(true);
      try {
        const base64 = await toJpegBase64(dataUrl);
        await Promise.all(
          CATEGORIES.map(async (cat) => {
            setProgress(p => ({ ...p, [cat.id]: "analyzing" }));
            try {
              const result = await analyzeCategory(base64, cat);
              setResults(r => ({ ...r, [cat.id]: result }));
              setProgress(p => ({ ...p, [cat.id]: "done" }));
            } catch (err) {
              setProgress(p => ({ ...p, [cat.id]: "error" }));
              setError(err.message || "Analysis failed.");
            }
          })
        );
      } catch (err) {
        setError(err.message || "Failed to process image.");
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  function reset() { setPreview(null); setResults({}); setProgress({}); setError(null); setShowReport(false); setReportSaved(false); }

  async function handleSaveToCollection(reportId) {
    const thumbnail = preview ? await toThumbnail(preview) : null;
    const entry = {
      id: Date.now().toString(36),
      reportId,
      date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
      cardName,
      company,
      pgScore,
      scores: rawScores,
      thumbnail,
    };
    const col = loadCollection();
    col.unshift(entry);
    saveCollection(col);
    setCollectionCount(col.length);
    setReportSaved(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#fff", fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { cursor: pointer; }
      `}</style>

      {showTips && <TipsModal onClose={() => setShowTips(false)} />}
      {showReport && allComplete && tier && (
        <ReportModal
          pgScore={pgScore} tier={tier} scores={rawScores}
          cardName={cardName} preview={preview} company={company}
          onClose={() => setShowReport(false)}
          onSaveToCollection={handleSaveToCollection}
          alreadySaved={reportSaved}
        />
      )}
      {showCollection && <CollectionModal onClose={() => { setShowCollection(false); setCollectionCount(loadCollection().length); }} />}

      {/* Header */}
      <div style={{ position: "relative", padding: "32px 20px 20px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 100% 80% at 50% 0%, rgba(255,215,0,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
        {/* Collection button top-right */}
        <button onClick={() => setShowCollection(true)} style={{ position: "absolute", top: 20, right: 16, background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.2)", color: "rgba(255,215,0,0.7)", borderRadius: 10, padding: "7px 12px", fontSize: 11, letterSpacing: 1 }}>
          📁 {collectionCount > 0 ? `${collectionCount}` : "COLLECTION"}
        </button>
        <div style={{ fontSize: 10, letterSpacing: 5, color: "rgba(255,215,0,0.45)", marginBottom: 4 }}>AI-POWERED PRE-GRADE SYSTEM</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 6, lineHeight: 0.9, background: "linear-gradient(180deg,#ffffff 0%,#999 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PG SCORE</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 4, color: "rgba(255,215,0,0.5)", marginTop: 6 }}>TRADING CARD PRE-GRADER</div>
        <button onClick={() => setShowTips(true)} style={{ marginTop: 14, padding: "7px 18px", borderRadius: 20, background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.2)", color: "rgba(255,215,0,0.6)", fontSize: 11, letterSpacing: 1 }}>
          📸 PHOTO TIPS & HOW IT WORKS
        </button>
      </div>

      <div style={{ padding: "0 16px 16px" }}>

        {/* Company Selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.22)", marginBottom: 8 }}>SELECT GRADING COMPANY</div>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(COMPANIES).map(([key, co]) => (
              <button key={key} onClick={() => setCompany(key)} style={{ flex: 1, padding: "9px 2px", borderRadius: 10, fontSize: 11, fontWeight: 700, background: company === key ? `${co.color}18` : "rgba(255,255,255,0.03)", border: `1.5px solid ${company === key ? co.color + "60" : "rgba(255,255,255,0.07)"}`, color: company === key ? co.color : "rgba(255,255,255,0.28)", transition: "all 0.2s" }}>{key}</button>
            ))}
          </div>
        </div>

        {/* Card Name */}
        <input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Card name (e.g. Charizard Base Set Holo #4)"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }} />

        {/* Upload */}
        {!preview ? (
          <div style={{ border: "1.5px dashed rgba(255,215,0,0.18)", borderRadius: 16, padding: "32px 20px", textAlign: "center", background: "rgba(255,215,0,0.01)", marginBottom: 16 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 4, color: "rgba(255,215,0,0.15)", marginBottom: 12 }}>PG</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>UPLOAD CARD PHOTO</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", marginBottom: 22, lineHeight: 1.6 }}>One photo · All 4 grades analyzed simultaneously</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 14 }}>
              <button onClick={() => cameraRef.current?.click()} style={{ flex: 1, maxWidth: 160, padding: "13px 8px", borderRadius: 12, background: "rgba(255,215,0,0.09)", border: "1px solid rgba(255,215,0,0.3)", color: "#FFD700", fontSize: 13, fontWeight: 600 }}>📷 Camera</button>
              <button onClick={() => galleryRef.current?.click()} style={{ flex: 1, maxWidth: 160, padding: "13px 8px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}>🖼️ Upload</button>
            </div>
            <button onClick={() => setShowTips(true)} style={{ fontSize: 11, color: "rgba(255,215,0,0.35)", background: "none", border: "none", textDecoration: "underline" }}>Best photo tips for accurate grades →</button>
          </div>
        ) : (
          <div style={{ marginBottom: 16, position: "relative" }}>
            <img src={preview} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", display: "block", background: "rgba(255,255,255,0.02)" }} />
            {!analyzing && (
              <button onClick={reset} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.8)", border: "1px solid rgba(239,83,80,0.3)", color: "#EF9A9A", borderRadius: 8, padding: "5px 12px", fontSize: 11 }}>✕ New</button>
            )}
          </div>
        )}

        {error && (
          <div style={{ color: "#EF9A9A", fontSize: 12, marginBottom: 14, padding: "10px 14px", background: "rgba(239,83,80,0.07)", borderRadius: 10, border: "1px solid rgba(239,83,80,0.18)", lineHeight: 1.5 }}>⚠️ {error}</div>
        )}

        {/* Progress + Grid */}
        {(analyzing || completedCount > 0) && (
          <>
            {analyzing && (
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,215,0,0.55)", marginBottom: 8 }}>ANALYZING {completedCount}/4 COMPLETE…</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  {CATEGORIES.map(c => (
                    <div key={c.id} style={{ width: 44, height: 3, borderRadius: 2, background: progress[c.id] === "done" ? "#4CAF50" : progress[c.id] === "analyzing" ? "#FFD700" : "rgba(255,255,255,0.08)", transition: "background 0.3s" }} />
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {CATEGORIES.map(cat => {
                const res = results[cat.id];
                const prog = progress[cat.id];
                const s = res?.score;
                const col = s == null ? "rgba(255,255,255,0.1)" : s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350";
                return (
                  <div key={cat.id} style={{ padding: "14px 12px", background: res ? `linear-gradient(135deg, ${col}08 0%, transparent 100%)` : "rgba(255,255,255,0.02)", borderRadius: 14, border: `1px solid ${res ? col + "35" : "rgba(255,255,255,0.05)"}`, transition: "all 0.4s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 15 }}>{cat.icon}</span>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: 5, letterSpacing: 1 }}>{cat.label.toUpperCase()}</span>
                      </div>
                      {prog === "analyzing" && <div style={{ width: 15, height: 15, border: "2px solid rgba(255,215,0,0.15)", borderTopColor: "#FFD700", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                      {prog === "done" && s != null && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: col, lineHeight: 1 }}>{s.toFixed(1)}</span>}
                      {prog === "error" && <span style={{ fontSize: 10, color: "#EF5350" }}>ERR</span>}
                    </div>
                    {s != null && <MiniBar score={s} color={col} />}
                    {res?.verdict && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 6, lineHeight: 1.5 }}>{res.verdict}</div>}
                    {res?.leftRight && <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 3 }}>L/R <span style={{ color: "#FFD700" }}>{res.leftRight}</span></div>}
                    {res?.defects?.filter(d => d && d !== "None").length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }}>
                        {res.defects.filter(d => d && d !== "None").map((d, i) => (
                          <span key={i} style={{ fontSize: 8, padding: "2px 6px", background: "rgba(239,83,80,0.09)", border: "1px solid rgba(239,83,80,0.2)", borderRadius: 20, color: "#EF9A9A" }}>{d}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", marginTop: 6, letterSpacing: 1 }}>WEIGHT {cat.weight}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Live partial score */}
        {pgScore != null && tier != null && !allComplete && (
          <div style={{ padding: 18, background: `linear-gradient(135deg, ${tier.color}07 0%, transparent 100%)`, border: `1px solid ${tier.color}25`, borderRadius: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ScoreRing score={pgScore} size={80} color={tier.color} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: tier.color, lineHeight: 1 }}>{pgScore.toFixed(1)}</div>
                  <div style={{ fontSize: 7, color: "rgba(255,255,255,0.28)", letterSpacing: 1 }}>LIVE</div>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: tier.color }}>{tier.badge} {tier.short}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>Likely: <strong style={{ color: tier.color }}>{tier.likely}</strong></div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>{completedCount} of 4 grades in…</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Final score + report button */}
      {allComplete && tier != null && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ background: `linear-gradient(135deg, ${tier.color}09 0%, rgba(8,8,16,0.95) 70%)`, border: `1px solid ${tier.color}30`, borderRadius: 20, padding: "22px 20px", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 9, letterSpacing: 4, color: `${tier.color}60`, marginBottom: 16 }}>FINAL RESULT · {COMPANIES[company].name.toUpperCase()}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ScoreRing score={pgScore} size={118} color={tier.color} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, color: tier.color, lineHeight: 1 }}>{pgScore.toFixed(1)}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>OUT OF 10</div>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: tier.color, letterSpacing: 1, marginBottom: 4 }}>{tier.badge} {tier.short}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.6, marginBottom: 10 }}>{tier.verdict}</div>
                <span style={{ fontSize: 11, padding: "5px 14px", background: `${tier.color}14`, border: `1px solid ${tier.color}30`, borderRadius: 20, color: tier.color }}>Predicted: {tier.likely}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CATEGORIES.map(c => {
                const s = rawScores[c.id];
                const col = s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350";
                return (
                  <div key={c.id} style={{ padding: "11px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid ${col}18` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>{c.icon} {c.label.toUpperCase()}</span>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: col }}>{s.toFixed(1)}</span>
                    </div>
                    <MiniBar score={s} color={col} />
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>Weight: {c.weight}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setShowReport(true)}
            style={{ width: "100%", padding: "16px", borderRadius: 14, background: `linear-gradient(135deg, ${tier.color}20 0%, ${tier.color}08 100%)`, border: `1.5px solid ${tier.color}50`, color: tier.color, fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 3, marginBottom: 10 }}>
            📄 GENERATE PG SCORE REPORT
          </button>
          <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.22)", marginBottom: 20 }}>
            Save as PDF · Add to Collection · Copy for listings
          </div>
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value = ""; } }} />
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value = ""; } }} />
    </div>
  );
}
