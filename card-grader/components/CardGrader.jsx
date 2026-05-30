import { useState, useRef, useCallback, useEffect } from "react";

const WEIGHTS = { centering: 0.20, corners: 0.30, edges: 0.25, surface: 0.25 };

const COMPANIES = {
  BGS: { name: "Beckett BGS", color: "#FFD700", tiers: [
    { min: 9.80, short: "BLACK LABEL", color: "#FFD700", badge: "🏆", likely: "BGS 10 Black Label", verdict: "Near-perfect. Extremely likely BGS 10 Black Label." },
    { min: 9.40, short: "PRISTINE",    color: "#E8E8E8", badge: "💎", likely: "BGS 10 Pristine",    verdict: "Exceptional quality. Strong BGS Pristine 10 candidate." },
    { min: 9.00, short: "GEM MINT",    color: "#64B5F6", badge: "⭐", likely: "BGS 9.5 Gem Mint",   verdict: "Very strong card. Likely BGS 9.5 Gem Mint." },
    { min: 8.50, short: "NM-MT",       color: "#81C784", badge: "✅", likely: "BGS 8–8.5",          verdict: "Solid card with minor flaws. Likely BGS 8 or 8.5." },
    { min: 7.50, short: "NEAR MINT",   color: "#FFB74D", badge: "📋", likely: "BGS 7–7.5",          verdict: "Noticeable wear. Likely BGS 7–7.5." },
    { min: 0,    short: "BELOW NM",    color: "#EF5350", badge: "⚠️", likely: "BGS 6 or lower",     verdict: "Significant defects. Not a premium grade candidate." },
  ]},
  PSA: { name: "PSA", color: "#E53935", tiers: [
    { min: 9.50, short: "GEM MT 10", color: "#FFD700", badge: "🏆", likely: "PSA 10 Gem Mint", verdict: "Near-perfect card. Strong PSA 10 candidate." },
    { min: 9.00, short: "MINT 9",    color: "#E8E8E8", badge: "💎", likely: "PSA 9 Mint",      verdict: "Excellent with minimal flaws. Likely PSA 9." },
    { min: 8.50, short: "NM-MT 8",   color: "#64B5F6", badge: "⭐", likely: "PSA 8 NM-MT",     verdict: "Very nice card. Likely PSA 8." },
    { min: 7.50, short: "NM 7",      color: "#81C784", badge: "✅", likely: "PSA 7 NM",        verdict: "Solid with minor wear. Likely PSA 7." },
    { min: 6.50, short: "EX-MT 6",   color: "#FFB74D", badge: "📋", likely: "PSA 5–6",         verdict: "Noticeable wear. Likely PSA 5 or 6." },
    { min: 0,    short: "BELOW EX",  color: "#EF5350", badge: "⚠️", likely: "PSA 4 or lower",  verdict: "Significant wear or defects. PSA 4 or lower." },
  ]},
  SGC: { name: "SGC", color: "#1E88E5", tiers: [
    { min: 9.70, short: "PRISTINE 10", color: "#FFD700", badge: "🏆", likely: "SGC 10 Pristine", verdict: "Near-flawless. Strong SGC 10 Pristine candidate." },
    { min: 9.20, short: "MINT+ 9.5",  color: "#E8E8E8", badge: "💎", likely: "SGC 9.5 Mint+",   verdict: "Exceptional quality. Likely SGC 9.5 Mint+." },
    { min: 8.80, short: "MINT 9",     color: "#64B5F6", badge: "⭐", likely: "SGC 9 Mint",       verdict: "Very strong card. Likely SGC 9 Mint." },
    { min: 8.00, short: "NM-MT 8",    color: "#81C784", badge: "✅", likely: "SGC 8–8.5",        verdict: "Solid. Likely SGC 8 or 8.5." },
    { min: 7.00, short: "NM 7",       color: "#FFB74D", badge: "📋", likely: "SGC 7–7.5",        verdict: "Noticeable wear. Likely SGC 7–7.5." },
    { min: 0,    short: "BELOW NM",   color: "#EF5350", badge: "⚠️", likely: "SGC 6 or lower",   verdict: "Significant defects. SGC 6 or lower." },
  ]},
  TAG: { name: "TAG", color: "#43A047", tiers: [
    { min: 9.50, short: "PERFECT 10",   color: "#FFD700", badge: "🏆", likely: "TAG 10 Perfect",   verdict: "Near-flawless. Strong TAG 10 candidate." },
    { min: 9.00, short: "GEM MINT 9.5", color: "#E8E8E8", badge: "💎", likely: "TAG 9.5 Gem Mint", verdict: "Exceptional card. Likely TAG 9.5 Gem Mint." },
    { min: 8.50, short: "MINT 9",       color: "#64B5F6", badge: "⭐", likely: "TAG 9 Mint",       verdict: "Very strong card. Likely TAG 9 Mint." },
    { min: 8.00, short: "NM-MT 8.5",    color: "#81C784", badge: "✅", likely: "TAG 8–8.5",        verdict: "Solid with minor wear. Likely TAG 8 or 8.5." },
    { min: 7.00, short: "NEAR MINT",    color: "#FFB74D", badge: "📋", likely: "TAG 7–7.5",        verdict: "Noticeable wear. Likely TAG 7–7.5." },
    { min: 0,    short: "BELOW NM",     color: "#EF5350", badge: "⚠️", likely: "TAG 6 or lower",   verdict: "Significant defects." },
  ]},
  CGC: { name: "CGC", color: "#AB47BC", tiers: [
    { min: 9.70, short: "PRISTINE 10",  color: "#FFD700", badge: "🏆", likely: "CGC 10 Pristine",  verdict: "Flawless. Strong CGC 10 Pristine candidate." },
    { min: 9.20, short: "GEM MINT 9.5", color: "#E8E8E8", badge: "💎", likely: "CGC 9.5 Gem Mint", verdict: "Exceptional quality. Likely CGC 9.5 Gem Mint." },
    { min: 8.80, short: "MINT 9",       color: "#64B5F6", badge: "⭐", likely: "CGC 9 Mint",       verdict: "Very strong card. Likely CGC 9 Mint." },
    { min: 8.20, short: "NM/MT+ 8.5",   color: "#81C784", badge: "✅", likely: "CGC 8.5 NM/MT+",  verdict: "Solid. Likely CGC 8.5." },
    { min: 7.50, short: "NM/MT 8",      color: "#FFB74D", badge: "📋", likely: "CGC 7.5–8",        verdict: "Noticeable wear. Likely CGC 7.5–8." },
    { min: 0,    short: "BELOW NM",     color: "#EF5350", badge: "⚠️", likely: "CGC 7 or lower",   verdict: "Significant defects. CGC 7 or lower." },
  ]},
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
function loadCollection() { try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) || "[]"); } catch { return []; } }
function saveCollection(col) { try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(col)); } catch {} }
function getTier(score, company) { const t = COMPANIES[company].tiers; return t.find(x => score >= x.min) || t[t.length - 1]; }
function calcPGScore(scores) {
  let tw = 0, ws = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) { if (scores[k] != null) { ws += scores[k] * w; tw += w; } }
  return tw === 0 ? null : Math.min(10, ws / tw);
}
function parseResponse(text) {
  if (!text) return { score: 7, verdict: "No response.", defects: [] };
  const f = text.indexOf("{"), l = text.lastIndexOf("}");
  if (f !== -1 && l > f) {
    try {
      const o = JSON.parse(text.slice(f, l + 1));
      if (typeof o.score === "number") return { score: Math.min(10, Math.max(1, o.score)), verdict: String(o.verdict || "").slice(0, 200), defects: Array.isArray(o.defects) ? o.defects.filter(Boolean) : [], leftRight: o.leftRight || null, topBottom: o.topBottom || null };
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
      if (w > maxDim || h > maxDim) { const r = Math.min(maxDim/w, maxDim/h); w = Math.round(w*r); h = Math.round(h*r); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.92).split(",")[1]);
    };
    img.onerror = reject; img.src = dataUrl;
  });
}
async function toThumbnail(dataUrl, maxDim = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const r = Math.min(maxDim/w, maxDim/h); w = Math.round(w*r); h = Math.round(h*r);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve(dataUrl); img.src = dataUrl;
  });
}
async function analyzeCategory(base64, cat) {
  const resp = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base64, prompt: cat.prompt }) });
  if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || "Analysis failed."); }
  const { text } = await resp.json();
  return parseResponse(text);
}

// ── Visual components ──────────────────────────────────────────────────

function TechCorners({ color = "#FFD700", size = 18, opacity = 0.5 }) {
  const p = `M0,${size} L0,0 L${size},0`;
  const s = { fill: "none", stroke: color, strokeWidth: 2, opacity };
  return (
    <>
      <svg style={{ position:"absolute", top:10, left:10, pointerEvents:"none" }} width={size} height={size}><path d={p} {...s}/></svg>
      <svg style={{ position:"absolute", top:10, right:10, transform:"scaleX(-1)", pointerEvents:"none" }} width={size} height={size}><path d={p} {...s}/></svg>
      <svg style={{ position:"absolute", bottom:10, left:10, transform:"scaleY(-1)", pointerEvents:"none" }} width={size} height={size}><path d={p} {...s}/></svg>
      <svg style={{ position:"absolute", bottom:10, right:10, transform:"scale(-1,-1)", pointerEvents:"none" }} width={size} height={size}><path d={p} {...s}/></svg>
    </>
  );
}

function ScoreRing({ score, size, color }) {
  const sw = size > 100 ? 9 : 7;
  const r = (size - sw * 2) / 2, r2 = r - sw - 6;
  const circ = 2 * Math.PI * r, circ2 = 2 * Math.PI * r2;
  const pct = Math.max(0, Math.min(1, score / 10));
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", display:"block", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={sw}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round"
        style={{ transition:"stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)", filter:`drop-shadow(0 0 8px ${color})` }}/>
      {size > 80 && <>
        <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={2}/>
        <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke={color} strokeWidth={2}
          strokeDasharray={`${pct*circ2*0.75} ${circ2}`} strokeLinecap="round"
          style={{ transition:"stroke-dasharray 1.5s cubic-bezier(0.34,1.56,0.64,1)", opacity:0.4, filter:`drop-shadow(0 0 4px ${color})` }}/>
      </>}
    </svg>
  );
}

function MiniBar({ score, color }) {
  return (
    <div style={{ height:3, background:"rgba(255,255,255,0.05)", borderRadius:2, marginTop:8, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${score/10*100}%`, background:`linear-gradient(90deg,${color}60,${color})`, borderRadius:2, transition:"width 1.2s cubic-bezier(0.34,1.56,0.64,1)", boxShadow:`0 0 8px ${color}80` }}/>
    </div>
  );
}

function TipsModal({ onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:100, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div style={{ width:"100%", background:"linear-gradient(180deg,#0d0d20 0%,#080814 100%)", borderRadius:"24px 24px 0 0", padding:"24px 20px 44px", maxHeight:"88vh", overflowY:"auto", borderTop:"1px solid rgba(255,215,0,0.12)", boxShadow:"0 -20px 60px rgba(124,58,237,0.12)" }} onClick={e=>e.stopPropagation()}>
        <div style={{ width:36, height:3, background:"rgba(255,255,255,0.12)", borderRadius:2, margin:"0 auto 24px" }}/>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:3, color:"#FFD700", textShadow:"0 0 20px rgba(255,215,0,0.4)" }}>📸 PHOTO GUIDE</div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", color:"rgba(255,255,255,0.5)", borderRadius:10, padding:"6px 14px", fontSize:13 }}>Done</button>
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:18, lineHeight:1.7, padding:14, background:"rgba(255,215,0,0.04)", borderRadius:12, border:"1px solid rgba(255,215,0,0.1)" }}>
          PG Score analyzes one photo for all 4 subgrades simultaneously. The better your photo, the more accurate the PG Score.
        </div>
        {PHOTO_TIPS.map((tip,i) => (
          <div key={i} style={{ display:"flex", gap:14, marginBottom:12, padding:14, background:"rgba(255,255,255,0.02)", borderRadius:14, border:"1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize:22, flexShrink:0, paddingTop:2 }}>{tip.icon}</div>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, letterSpacing:1, color:"#FFD700", marginBottom:3 }}>{tip.title}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.6 }}>{tip.text}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop:8, padding:16, background:"rgba(255,215,0,0.04)", borderRadius:14, border:"1px solid rgba(255,215,0,0.12)" }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:13, letterSpacing:2, color:"#FFD700", marginBottom:8 }}>HOW THE SCORE WORKS</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.7 }}>
            AI grades 4 categories: <strong style={{ color:"rgba(255,255,255,0.8)" }}>Corners (30%)</strong>, <strong style={{ color:"rgba(255,255,255,0.8)" }}>Edges (25%)</strong>, <strong style={{ color:"rgba(255,255,255,0.8)" }}>Surface (25%)</strong>, <strong style={{ color:"rgba(255,255,255,0.8)" }}>Centering (20%)</strong>. Weighted into a PG Score out of 10, mapped to your chosen grading company.
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ pgScore, tier, scores, cardName, preview, company, onClose, onSaveToCollection, alreadySaved }) {
  const date = new Date().toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" });
  const reportId = useRef("PG-" + Date.now().toString(36).toUpperCase().slice(-6));
  const [savingPdf, setSavingPdf] = useState(false);
  const [saved, setSaved] = useState(alreadySaved);
  const col = tier.color;

  async function handleSavePDF() {
    const el = document.getElementById("pg-report-card");
    if (!el) return;
    setSavingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(el, { backgroundColor:"#08080f", scale:2, useCORS:true, allowTaint:true });
      const pdf = new jsPDF({ orientation:"portrait", unit:"px", format:[canvas.width/2, canvas.height/2] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width/2, canvas.height/2);
      pdf.save(`PGScore-${(cardName||"card").replace(/\s+/g,"-")}-${reportId.current}.pdf`);
    } catch { alert("PDF export failed. Try Print → Save as PDF."); }
    finally { setSavingPdf(false); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.97)", zIndex:200, overflowY:"auto", padding:"20px 16px 60px" }}>
      <style>{`@media print{body *{visibility:hidden}#pg-report-card,#pg-report-card *{visibility:visible}#pg-report-card{position:fixed;top:0;left:0;width:100%}}`}</style>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, maxWidth:480, margin:"0 auto 20px" }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:13, letterSpacing:4, color:"rgba(255,255,255,0.3)" }}>PG SCORE REPORT</div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.5)", borderRadius:10, padding:"7px 16px", fontSize:13 }}>✕ Close</button>
      </div>

      <div id="pg-report-card" style={{ background:"linear-gradient(145deg,#0c0c1e 0%,#08080f 100%)", border:`1px solid ${col}40`, borderRadius:20, overflow:"hidden", maxWidth:480, margin:"0 auto", boxShadow:`0 0 40px ${col}15` }}>
        <div style={{ background:`linear-gradient(135deg,${col}15 0%,transparent 60%)`, padding:"20px 24px 16px", borderBottom:`1px solid ${col}18`, position:"relative" }}>
          <div style={{ position:"absolute", top:0, right:0, width:100, height:100, background:`radial-gradient(circle,${col}12 0%,transparent 70%)`, pointerEvents:"none" }}/>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", position:"relative" }}>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:5, color:col, lineHeight:1, textShadow:`0 0 20px ${col}60` }}>PG SCORE™</div>
              <div style={{ fontSize:8, letterSpacing:3, color:"rgba(255,255,255,0.25)", marginTop:3 }}>AI-POWERED PRE-GRADE CERTIFICATE</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.22)" }}>{date}</div>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:col, marginTop:2, opacity:0.5 }}>{reportId.current}</div>
            </div>
          </div>
        </div>

        <div style={{ padding:"20px 24px", display:"flex", gap:16, alignItems:"flex-start", borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
          {preview && <div style={{ position:"relative", flexShrink:0 }}>
            <img src={preview} alt="Card" style={{ width:88, height:124, objectFit:"contain", borderRadius:8, border:`1px solid ${col}25`, display:"block", background:"rgba(0,0,0,0.3)" }}/>
            <div style={{ position:"absolute", inset:0, borderRadius:8, background:`linear-gradient(135deg,${col}10 0%,transparent 60%)`, pointerEvents:"none" }}/>
          </div>}
          <div style={{ flex:1 }}>
            <div style={{ fontSize:8, color:"rgba(255,255,255,0.22)", letterSpacing:2, marginBottom:4 }}>CARD IDENTITY</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:17, color:"#fff", lineHeight:1.2, marginBottom:12 }}>{cardName||"Trading Card"}</div>
            <div style={{ fontSize:8, color:"rgba(255,255,255,0.22)", letterSpacing:2, marginBottom:6 }}>PREDICTED GRADE</div>
            <div style={{ display:"inline-block", padding:"5px 12px", background:`${col}12`, border:`1px solid ${col}35`, borderRadius:20, boxShadow:`0 0 12px ${col}20` }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:13, color:col, letterSpacing:1 }}>{COMPANIES[company].name} · {tier.likely}</span>
            </div>
          </div>
        </div>

        <div style={{ padding:"24px", textAlign:"center", borderBottom:`1px solid rgba(255,255,255,0.04)`, background:`radial-gradient(ellipse 60% 80% at 50% 50%,${col}06 0%,transparent 70%)` }}>
          <div style={{ fontSize:8, letterSpacing:5, color:"rgba(255,255,255,0.2)", marginBottom:16 }}>PG SCORE</div>
          <div style={{ display:"flex", justifyContent:"center", alignItems:"center", position:"relative" }}>
            <ScoreRing score={pgScore} size={140} color={col}/>
            <div style={{ position:"absolute", display:"flex", flexDirection:"column", alignItems:"center" }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:56, color:col, lineHeight:1, textShadow:`0 0 30px ${col}80` }}>{pgScore.toFixed(1)}</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,0.28)", letterSpacing:3 }}>OUT OF 10</div>
            </div>
          </div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:col, letterSpacing:2, marginTop:14, textShadow:`0 0 20px ${col}50` }}>{tier.badge} {tier.short}</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.32)", marginTop:8, lineHeight:1.6, maxWidth:280, margin:"10px auto 0" }}>{tier.verdict}</div>
        </div>

        <div style={{ padding:"20px 24px", borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
          <div style={{ fontSize:8, letterSpacing:4, color:"rgba(255,255,255,0.18)", marginBottom:14 }}>SUBGRADE ANALYSIS</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {CATEGORIES.map(c => {
              const s = scores[c.id];
              const sc = s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350";
              return (
                <div key={c.id} style={{ padding:"12px 14px", background:"rgba(255,255,255,0.02)", borderRadius:12, border:`1px solid ${sc}20` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:8, color:"rgba(255,255,255,0.28)", letterSpacing:1 }}>{c.icon} {c.label.toUpperCase()}</div>
                      <div style={{ fontSize:7, color:"rgba(255,255,255,0.14)", marginTop:1 }}>{c.weight} weight</div>
                    </div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, color:sc, lineHeight:1, textShadow:`0 0 10px ${sc}60` }}>{s!=null?s.toFixed(1):"—"}</div>
                  </div>
                  <MiniBar score={s||0} color={sc}/>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding:"14px 24px", background:"rgba(0,0,0,0.4)" }}>
          <div style={{ fontSize:8, color:"rgba(255,255,255,0.14)", lineHeight:1.6, textAlign:"center" }}>
            AI-generated pre-grade estimate. Not an official grade from PSA, BGS, SGC, TAG, or CGC. ID: {reportId.current}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:480, margin:"16px auto 0", display:"flex", flexDirection:"column", gap:10 }}>
        <button onClick={handleSavePDF} disabled={savingPdf}
          style={{ width:"100%", padding:16, borderRadius:14, background:`linear-gradient(135deg,${col}20 0%,${col}08 100%)`, border:`1.5px solid ${col}50`, color:col, fontSize:15, fontWeight:700, opacity:savingPdf?0.6:1, boxShadow:savingPdf?"none":`0 0 20px ${col}20` }}>
          {savingPdf ? "⏳ Generating PDF…" : "⬇️ Save as PDF"}
        </button>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => { onSaveToCollection(reportId.current); setSaved(true); }} disabled={saved}
            style={{ flex:1, padding:13, borderRadius:12, background:saved?"rgba(76,175,80,0.08)":"rgba(255,255,255,0.04)", border:`1px solid ${saved?"#4CAF5040":"rgba(255,255,255,0.08)"}`, color:saved?"#4CAF50":"rgba(255,255,255,0.5)", fontSize:13, fontWeight:600 }}>
            {saved ? "✅ Saved" : "📁 Save to Collection"}
          </button>
          <button onClick={() => {
            const lines = ["PG SCORE™ — AI PRE-GRADE CERTIFICATE","━━━━━━━━━━━━━━━━━━━━━━━━━",`Card: ${cardName||"Trading Card"}`,`Date: ${date}  |  ID: ${reportId.current}`,"",`PG SCORE: ${pgScore.toFixed(1)}/10`,`${tier.badge} ${tier.short}`,`Predicted: ${COMPANIES[company].name} · ${tier.likely}`,"","SUBGRADES",`  ◢ Corners   ${scores.corners?.toFixed(1)??"—"}/10  (30%)`,`  ▬ Edges     ${scores.edges?.toFixed(1)??"—"}/10  (25%)`,`  ◈ Surface   ${scores.surface?.toFixed(1)??"—"}/10  (25%)`,`  ⊞ Centering ${scores.centering?.toFixed(1)??"—"}/10  (20%)`,"",`"${tier.verdict}"`,"","AI pre-grade estimate. #PGScore #CardGrading"].join("\n");
            navigator.clipboard.writeText(lines).then(() => alert("Copied!"));
          }}
            style={{ flex:1, padding:13, borderRadius:12, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.45)", fontSize:13, fontWeight:600 }}>
            📋 Copy Text
          </button>
        </div>
      </div>
      <div style={{ maxWidth:480, margin:"10px auto 0", textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.16)" }}>
        PDF saves directly to your device — no account needed
      </div>
    </div>
  );
}

function CollectionModal({ onClose }) {
  const [collection, setCollection] = useState([]);
  const [savingPdf, setSavingPdf] = useState(null);
  useEffect(() => { setCollection(loadCollection()); }, []);

  function deleteCard(id) { const u = collection.filter(c=>c.id!==id); setCollection(u); saveCollection(u); }

  async function downloadCardPdf(card) {
    setSavingPdf(card.id);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const el = document.getElementById(`cc-${card.id}`);
      if (!el) return;
      const canvas = await html2canvas(el, { backgroundColor:"#08080f", scale:2, useCORS:true });
      const pdf = new jsPDF({ orientation:"portrait", unit:"px", format:[canvas.width/2, canvas.height/2] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width/2, canvas.height/2);
      pdf.save(`PGScore-${(card.cardName||"card").replace(/\s+/g,"-")}-${card.reportId}.pdf`);
    } catch { alert("PDF export failed."); }
    finally { setSavingPdf(null); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"#030310", zIndex:300, overflowY:"auto", padding:"24px 16px 80px" }}>
      <div style={{ position:"fixed", inset:0, backgroundImage:"radial-gradient(rgba(255,215,0,0.03) 1px,transparent 1px)", backgroundSize:"28px 28px", pointerEvents:"none" }}/>
      <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse 80% 40% at 50% 0%,rgba(124,58,237,0.1) 0%,transparent 55%)", pointerEvents:"none" }}/>
      <div style={{ position:"relative", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:4, color:"#FFD700", textShadow:"0 0 20px rgba(255,215,0,0.35)" }}>MY COLLECTION</div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:10, color:"rgba(255,255,255,0.22)", marginTop:2 }}>{collection.length} card{collection.length!==1?"s":""} · stored on this device</div>
        </div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", color:"rgba(255,255,255,0.5)", borderRadius:10, padding:"7px 16px", fontSize:13 }}>✕ Close</button>
      </div>

      {collection.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"rgba(255,255,255,0.18)", position:"relative" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📁</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, marginBottom:8 }}>NO CARDS YET</div>
          <div style={{ fontSize:12, lineHeight:1.6 }}>Grade a card and tap "Save to Collection" to build your portfolio.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14, position:"relative" }}>
          {collection.map(card => {
            const t = getTier(card.pgScore, card.company);
            const col = t.color;
            return (
              <div key={card.id}>
                <div id={`cc-${card.id}`} style={{ background:"linear-gradient(145deg,#0c0c1e 0%,#08080f 100%)", border:`1px solid ${col}30`, borderRadius:16, overflow:"hidden", boxShadow:`0 0 20px ${col}10` }}>
                  <div style={{ background:`linear-gradient(135deg,${col}12 0%,transparent 50%)`, padding:"12px 16px", borderBottom:`1px solid ${col}15`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, letterSpacing:4, color:col, textShadow:`0 0 10px ${col}50` }}>PG SCORE™</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.2)" }}>{card.date} · {card.reportId}</div>
                  </div>
                  <div style={{ padding:"14px 16px", display:"flex", gap:12, alignItems:"center" }}>
                    {card.thumbnail && <div style={{ position:"relative", flexShrink:0 }}>
                      <img src={card.thumbnail} alt="" style={{ width:56, height:78, objectFit:"contain", borderRadius:6, border:`1px solid ${col}20`, display:"block", background:"rgba(0,0,0,0.3)" }}/>
                      <div style={{ position:"absolute", inset:0, borderRadius:6, background:`linear-gradient(135deg,${col}10 0%,transparent 60%)`, pointerEvents:"none" }}/>
                    </div>}
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color:"#fff", marginBottom:6, lineHeight:1.2 }}>{card.cardName||"Trading Card"}</div>
                      <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:8 }}>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:col, lineHeight:1, textShadow:`0 0 15px ${col}60` }}>{card.pgScore.toFixed(1)}</div>
                        <div>
                          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:12, color:col }}>{t.badge} {t.short}</div>
                          <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)" }}>{COMPANIES[card.company].name} · {t.likely}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {CATEGORIES.map(c => {
                          const s = card.scores[c.id];
                          const sc = s>=9?"#4CAF50":s>=7.5?"#FFD700":"#EF5350";
                          return <div key={c.id} style={{ fontFamily:"'DM Mono',monospace", fontSize:9, padding:"3px 8px", background:`${sc}10`, border:`1px solid ${sc}25`, borderRadius:6, color:sc }}>{c.label.slice(0,3).toUpperCase()} {s?.toFixed(1)}</div>;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8, marginTop:8 }}>
                  <button onClick={() => downloadCardPdf(card)} disabled={savingPdf===card.id}
                    style={{ flex:1, padding:11, borderRadius:10, background:`${col}10`, border:`1px solid ${col}30`, color:col, fontSize:12, fontWeight:700, opacity:savingPdf===card.id?0.6:1 }}>
                    {savingPdf===card.id?"⏳ Saving…":"⬇️ Save PDF"}
                  </button>
                  <button onClick={() => deleteCard(card.id)}
                    style={{ padding:"11px 16px", borderRadius:10, background:"rgba(239,83,80,0.05)", border:"1px solid rgba(239,83,80,0.15)", color:"#EF9A9A", fontSize:12 }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────

export default function CardGrader() {
  const [company, setCompany]               = useState("BGS");
  const [cardName, setCardName]             = useState("");
  const [preview, setPreview]               = useState(null);
  const [analyzing, setAnalyzing]           = useState(false);
  const [progress, setProgress]             = useState({});
  const [results, setResults]               = useState({});
  const [error, setError]                   = useState(null);
  const [showTips, setShowTips]             = useState(false);
  const [showReport, setShowReport]         = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [collectionCount, setCollectionCount] = useState(0);
  const [reportSaved, setReportSaved]       = useState(false);
  const cameraRef = useRef(), galleryRef = useRef();

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
      setPreview(dataUrl); setAnalyzing(true);
      try {
        const base64 = await toJpegBase64(dataUrl);
        await Promise.all(CATEGORIES.map(async (cat) => {
          setProgress(p => ({ ...p, [cat.id]:"analyzing" }));
          try {
            const result = await analyzeCategory(base64, cat);
            setResults(r => ({ ...r, [cat.id]:result }));
            setProgress(p => ({ ...p, [cat.id]:"done" }));
          } catch (err) {
            setProgress(p => ({ ...p, [cat.id]:"error" }));
            setError(err.message || "Analysis failed.");
          }
        }));
      } catch (err) { setError(err.message || "Failed to process image."); }
      finally { setAnalyzing(false); }
    };
    reader.readAsDataURL(file);
  }, []);

  function reset() { setPreview(null); setResults({}); setProgress({}); setError(null); setShowReport(false); setReportSaved(false); }

  async function handleSaveToCollection(reportId) {
    const thumbnail = preview ? await toThumbnail(preview) : null;
    const entry = { id: Date.now().toString(36), reportId, date: new Date().toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}), cardName, company, pgScore, scores: rawScores, thumbnail };
    const col = loadCollection(); col.unshift(entry); saveCollection(col);
    setCollectionCount(col.length); setReportSaved(true);
  }

  return (
    <div style={{ minHeight:"100vh", background:"#030310", color:"#fff", fontFamily:"'DM Sans',sans-serif", paddingBottom:80, position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        @keyframes holoShimmer { 0%{background-position:-300% center} 100%{background-position:300% center} }
        @keyframes scanDown { 0%{top:-4px;opacity:0} 5%{opacity:1} 90%{opacity:0.8} 100%{top:100%;opacity:0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glowPulse { 0%,100%{box-shadow:0 0 20px rgba(255,215,0,0.08)} 50%{box-shadow:0 0 40px rgba(255,215,0,0.22)} }
        * { box-sizing:border-box; margin:0; padding:0; }
        button { cursor:pointer; }
        input::placeholder { color:rgba(255,255,255,0.18); }
        input:focus { outline:none; }
      `}</style>

      {/* Fixed background layers */}
      <div style={{ position:"fixed", inset:0, background:"radial-gradient(ellipse 100% 50% at 50% -5%,rgba(124,58,237,0.13) 0%,transparent 55%), radial-gradient(ellipse 50% 25% at 10% 100%,rgba(30,58,138,0.08) 0%,transparent 50%), #030310", pointerEvents:"none", zIndex:0 }}/>
      <div style={{ position:"fixed", inset:0, backgroundImage:"radial-gradient(rgba(255,255,255,0.022) 1px,transparent 1px)", backgroundSize:"28px 28px", pointerEvents:"none", zIndex:0 }}/>

      {showTips && <TipsModal onClose={() => setShowTips(false)} />}
      {showReport && allComplete && tier && (
        <ReportModal pgScore={pgScore} tier={tier} scores={rawScores} cardName={cardName} preview={preview} company={company} onClose={() => setShowReport(false)} onSaveToCollection={handleSaveToCollection} alreadySaved={reportSaved}/>
      )}
      {showCollection && <CollectionModal onClose={() => { setShowCollection(false); setCollectionCount(loadCollection().length); }}/>}

      <div style={{ position:"relative", zIndex:1 }}>

        {/* ── HEADER ── */}
        <div style={{ padding:"36px 20px 24px", textAlign:"center", position:"relative" }}>
          <button onClick={() => setShowCollection(true)} style={{ position:"absolute", top:24, right:16, background:"rgba(255,215,0,0.06)", border:"1px solid rgba(255,215,0,0.18)", color:"rgba(255,215,0,0.65)", borderRadius:10, padding:"7px 13px", fontSize:11, letterSpacing:1 }}>
            📁{collectionCount > 0 ? ` ${collectionCount}` : ""}
          </button>

          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:6, color:"rgba(255,215,0,0.3)", marginBottom:10 }}>AI-POWERED PRE-GRADE SYSTEM</div>

          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:78, letterSpacing:8, lineHeight:0.9, background:"linear-gradient(90deg,#B8860B 0%,#FFD700 18%,#FFF8E1 32%,#FFD700 48%,#E040FB 63%,#7C4DFF 74%,#FFD700 88%,#FFF8E1 100%)", backgroundSize:"300% auto", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", animation:"holoShimmer 5s linear infinite", filter:"drop-shadow(0 0 28px rgba(255,215,0,0.25))" }}>
            PG SCORE
          </div>

          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:11, letterSpacing:5, color:"rgba(255,215,0,0.3)", marginTop:10, marginBottom:18 }}>TRADING CARD PRE-GRADER</div>

          <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginBottom:18 }}>
            <div style={{ flex:1, maxWidth:70, height:1, background:"linear-gradient(90deg,transparent,rgba(255,215,0,0.25))" }}/>
            <div style={{ width:5, height:5, background:"rgba(255,215,0,0.5)", transform:"rotate(45deg)" }}/>
            <div style={{ flex:1, maxWidth:70, height:1, background:"linear-gradient(90deg,rgba(255,215,0,0.25),transparent)" }}/>
          </div>

          <button onClick={() => setShowTips(true)} style={{ padding:"8px 20px", borderRadius:20, background:"rgba(255,215,0,0.06)", border:"1px solid rgba(255,215,0,0.16)", color:"rgba(255,215,0,0.5)", fontSize:11, letterSpacing:1 }}>
            📸 PHOTO TIPS & HOW IT WORKS
          </button>
        </div>

        <div style={{ padding:"0 16px 16px", maxWidth:540, margin:"0 auto" }}>

          {/* ── COMPANY SELECTOR ── */}
          <div style={{ marginBottom:18 }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, letterSpacing:4, color:"rgba(255,255,255,0.18)", marginBottom:10 }}>SELECT GRADING COMPANY</div>
            <div style={{ display:"flex", gap:6 }}>
              {Object.entries(COMPANIES).map(([key,co]) => (
                <button key={key} onClick={() => setCompany(key)} style={{ flex:1, padding:"12px 2px", borderRadius:12, fontSize:12, fontWeight:800, background:company===key?`linear-gradient(135deg,${co.color}20 0%,${co.color}08 100%)`:"rgba(255,255,255,0.02)", border:`1.5px solid ${company===key?co.color+"55":"rgba(255,255,255,0.06)"}`, color:company===key?co.color:"rgba(255,255,255,0.2)", transition:"all 0.25s", boxShadow:company===key?`0 0 18px ${co.color}18,inset 0 0 12px ${co.color}08`:"none" }}>
                  {key}
                </button>
              ))}
            </div>
          </div>

          {/* ── CARD NAME ── */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, letterSpacing:4, color:"rgba(255,255,255,0.18)", marginBottom:8 }}>CARD IDENTITY</div>
            <input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="e.g. Charizard Base Set Holo #4"
              style={{ width:"100%", background:"rgba(255,255,255,0.03)", border:`1px solid ${cardName?"rgba(255,215,0,0.22)":"rgba(255,255,255,0.07)"}`, borderRadius:12, padding:"13px 16px", fontSize:13, color:"#fff", fontFamily:"'DM Sans',sans-serif", transition:"border-color 0.3s", boxShadow:cardName?"0 0 14px rgba(255,215,0,0.06)":"none" }}/>
          </div>

          {/* ── UPLOAD ZONE ── */}
          {!preview ? (
            <div style={{ position:"relative", marginBottom:16, borderRadius:20, border:"1px solid rgba(255,215,0,0.1)", background:"rgba(255,215,0,0.008)", padding:"40px 24px 36px", textAlign:"center", animation:"glowPulse 3s ease-in-out infinite" }}>
              <TechCorners color="rgba(255,215,0,0.35)" size={20}/>
              <div style={{ marginBottom:20, display:"flex", justifyContent:"center" }}>
                <div style={{ width:58, height:82, borderRadius:6, border:"1.5px dashed rgba(255,215,0,0.14)", background:"rgba(255,215,0,0.015)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", border:"1.5px solid rgba(255,215,0,0.14)" }}/>
                </div>
              </div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:3, color:"rgba(255,255,255,0.6)", marginBottom:6 }}>SCAN CARD FOR GRADING</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.2)", marginBottom:26, lineHeight:1.6 }}>One photo · All 4 categories analyzed simultaneously</div>
              <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:16 }}>
                <button onClick={() => cameraRef.current?.click()} style={{ flex:1, maxWidth:160, padding:"14px 8px", borderRadius:14, background:"linear-gradient(135deg,rgba(255,215,0,0.12) 0%,rgba(255,215,0,0.04) 100%)", border:"1px solid rgba(255,215,0,0.28)", color:"#FFD700", fontSize:13, fontWeight:700, boxShadow:"0 0 18px rgba(255,215,0,0.1)" }}>📷 Camera</button>
                <button onClick={() => galleryRef.current?.click()} style={{ flex:1, maxWidth:160, padding:"14px 8px", borderRadius:14, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.42)", fontSize:13, fontWeight:700 }}>🖼️ Upload</button>
              </div>
              <button onClick={() => setShowTips(true)} style={{ fontSize:11, color:"rgba(255,215,0,0.28)", background:"none", border:"none", textDecoration:"underline" }}>Best photo tips for accurate grades →</button>
            </div>
          ) : (
            <div style={{ marginBottom:16, position:"relative", borderRadius:16, overflow:"hidden", border:"1px solid rgba(255,255,255,0.06)" }}>
              <img src={preview} alt="" style={{ width:"100%", maxHeight:280, objectFit:"contain", display:"block", background:"rgba(0,0,0,0.2)" }}/>
              {analyzing && (
                <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
                  <div style={{ position:"absolute", left:0, right:0, height:2, background:"linear-gradient(90deg,transparent 0%,rgba(255,215,0,0.8) 30%,#FFD700 50%,rgba(255,215,0,0.8) 70%,transparent 100%)", boxShadow:"0 0 14px rgba(255,215,0,0.7)", animation:"scanDown 1.8s ease-in-out infinite" }}/>
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(255,215,0,0.018) 0%,transparent 60%)" }}/>
                </div>
              )}
              {!analyzing && <button onClick={reset} style={{ position:"absolute", top:10, right:10, background:"rgba(0,0,0,0.7)", border:"1px solid rgba(239,83,80,0.22)", color:"#EF9A9A", borderRadius:8, padding:"5px 12px", fontSize:11 }}>✕ New</button>}
            </div>
          )}

          {error && <div style={{ color:"#EF9A9A", fontSize:12, marginBottom:14, padding:"12px 16px", background:"rgba(239,83,80,0.06)", borderRadius:12, border:"1px solid rgba(239,83,80,0.14)", lineHeight:1.5 }}>⚠️ {error}</div>}

          {/* ── ANALYSIS GRID ── */}
          {(analyzing || completedCount > 0) && (
            <div style={{ animation:"fadeUp 0.4s ease" }}>
              {analyzing && (
                <div style={{ textAlign:"center", marginBottom:16 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:4, color:"rgba(255,215,0,0.45)", marginBottom:10 }}>SCANNING {completedCount}/4 COMPLETE…</div>
                  <div style={{ display:"flex", justifyContent:"center", gap:6 }}>
                    {CATEGORIES.map(c => (
                      <div key={c.id} style={{ flex:1, height:2, borderRadius:2, background:progress[c.id]==="done"?"#4CAF50":progress[c.id]==="analyzing"?"#FFD700":"rgba(255,255,255,0.05)", transition:"background 0.4s", boxShadow:progress[c.id]==="done"?"0 0 6px #4CAF5060":progress[c.id]==="analyzing"?"0 0 6px rgba(255,215,0,0.5)":"none" }}/>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                {CATEGORIES.map(cat => {
                  const res = results[cat.id], prog = progress[cat.id], s = res?.score;
                  const col = s==null?"rgba(255,255,255,0.07)":s>=9?"#4CAF50":s>=7.5?"#FFD700":"#EF5350";
                  return (
                    <div key={cat.id} style={{ padding:"15px 13px", background:res?`linear-gradient(135deg,${col}08 0%,rgba(0,0,0,0.2) 100%)`:"rgba(255,255,255,0.01)", borderRadius:16, border:`1px solid ${res?col+"28":"rgba(255,255,255,0.04)"}`, transition:"all 0.5s", boxShadow:res?`0 0 20px ${col}10`:"none", animation:res?"fadeUp 0.4s ease":"none" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:17, marginBottom:2 }}>{cat.icon}</div>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, color:"rgba(255,255,255,0.25)", letterSpacing:1 }}>{cat.label.toUpperCase()}</div>
                        </div>
                        {prog==="analyzing" && <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                          <div style={{ width:18, height:18, border:"2px solid rgba(255,215,0,0.1)", borderTopColor:"#FFD700", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
                          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:"rgba(255,215,0,0.35)", letterSpacing:1 }}>SCAN</div>
                        </div>}
                        {prog==="done" && s!=null && <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, color:col, lineHeight:1, textShadow:`0 0 12px ${col}70` }}>{s.toFixed(1)}</span>}
                        {prog==="error" && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"#EF5350" }}>ERR</span>}
                      </div>
                      {s!=null && <MiniBar score={s} color={col}/>}
                      {res?.verdict && <div style={{ fontSize:10, color:"rgba(255,255,255,0.28)", marginTop:8, lineHeight:1.5 }}>{res.verdict}</div>}
                      {res?.leftRight && <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, color:"rgba(255,255,255,0.2)", marginTop:4 }}>L/R <span style={{ color:"#FFD700" }}>{res.leftRight}</span></div>}
                      {res?.defects?.filter(d=>d&&d!=="None").length>0 && (
                        <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:8 }}>
                          {res.defects.filter(d=>d&&d!=="None").map((d,i) => <span key={i} style={{ fontFamily:"'DM Mono',monospace", fontSize:7, padding:"2px 6px", background:"rgba(239,83,80,0.08)", border:"1px solid rgba(239,83,80,0.16)", borderRadius:4, color:"#EF9A9A" }}>{d}</span>)}
                        </div>
                      )}
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:"rgba(255,255,255,0.1)", marginTop:8, letterSpacing:1 }}>WT {cat.weight}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── LIVE PARTIAL SCORE ── */}
          {pgScore!=null && tier!=null && !allComplete && (
            <div style={{ padding:18, background:`linear-gradient(135deg,${tier.color}08 0%,transparent 100%)`, border:`1px solid ${tier.color}20`, borderRadius:18, marginBottom:14, boxShadow:`0 0 30px ${tier.color}08` }}>
              <div style={{ display:"flex", alignItems:"center", gap:18 }}>
                <div style={{ position:"relative", flexShrink:0 }}>
                  <ScoreRing score={pgScore} size={82} color={tier.color}/>
                  <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:tier.color, lineHeight:1, textShadow:`0 0 10px ${tier.color}80` }}>{pgScore.toFixed(1)}</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:6, color:"rgba(255,255,255,0.22)", letterSpacing:1 }}>LIVE</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:tier.color, letterSpacing:1 }}>{tier.badge} {tier.short}</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.32)" }}>Likely: <strong style={{ color:tier.color }}>{tier.likely}</strong></div>
                  <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9, color:"rgba(255,255,255,0.16)", marginTop:3 }}>{completedCount}/4 sensors complete</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── FINAL SCORE ── */}
        {allComplete && tier!=null && (
          <div style={{ padding:"0 16px", maxWidth:540, margin:"0 auto", animation:"fadeUp 0.5s ease" }}>
            <div style={{ background:`linear-gradient(145deg,${tier.color}10 0%,rgba(8,8,20,0.95) 65%)`, border:`1px solid ${tier.color}35`, borderRadius:24, padding:"28px 22px", marginBottom:14, boxShadow:`0 0 60px ${tier.color}12,0 0 120px ${tier.color}06`, position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:-40, right:-40, width:200, height:200, background:`radial-gradient(circle,${tier.color}15 0%,transparent 70%)`, pointerEvents:"none" }}/>
              <TechCorners color={tier.color} size={16} opacity={0.25}/>

              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:8, letterSpacing:4, color:`${tier.color}50`, marginBottom:18 }}>FINAL RESULT · {COMPANIES[company].name.toUpperCase()}</div>
              <div style={{ display:"flex", alignItems:"center", gap:22, marginBottom:22 }}>
                <div style={{ position:"relative", flexShrink:0 }}>
                  <ScoreRing score={pgScore} size={124} color={tier.color}/>
                  <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:42, color:tier.color, lineHeight:1, textShadow:`0 0 30px ${tier.color}90` }}>{pgScore.toFixed(1)}</div>
                    <div style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:"rgba(255,255,255,0.22)", letterSpacing:2 }}>OUT OF 10</div>
                  </div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:tier.color, letterSpacing:1, marginBottom:4, textShadow:`0 0 20px ${tier.color}60` }}>{tier.badge} {tier.short}</div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,0.36)", lineHeight:1.6, marginBottom:12 }}>{tier.verdict}</div>
                  <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, padding:"5px 12px", background:`${tier.color}12`, border:`1px solid ${tier.color}25`, borderRadius:20, color:tier.color }}>→ {tier.likely}</span>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {CATEGORIES.map(c => {
                  const s = rawScores[c.id];
                  const col = s>=9?"#4CAF50":s>=7.5?"#FFD700":"#EF5350";
                  return (
                    <div key={c.id} style={{ padding:"11px 13px", background:"rgba(0,0,0,0.3)", borderRadius:12, border:`1px solid ${col}15` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:10, color:"rgba(255,255,255,0.3)" }}>{c.icon} {c.label.toUpperCase()}</span>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:col, textShadow:`0 0 8px ${col}60` }}>{s.toFixed(1)}</span>
                      </div>
                      <MiniBar score={s} color={col}/>
                      <div style={{ fontFamily:"'DM Mono',monospace", fontSize:7, color:"rgba(255,255,255,0.14)", marginTop:5 }}>WT: {c.weight}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={() => setShowReport(true)} style={{ width:"100%", padding:18, borderRadius:16, background:`linear-gradient(135deg,${tier.color}18 0%,${tier.color}06 100%)`, border:`1.5px solid ${tier.color}45`, color:tier.color, fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:3, marginBottom:10, boxShadow:`0 0 28px ${tier.color}18` }}>
              📄 GENERATE PG SCORE REPORT
            </button>
            <div style={{ textAlign:"center", fontFamily:"'DM Mono',monospace", fontSize:10, color:"rgba(255,255,255,0.16)", marginBottom:20, letterSpacing:1 }}>
              SAVE AS PDF · ADD TO COLLECTION · COPY FOR LISTINGS
            </div>
          </div>
        )}
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value=""; } }}/>
      <input ref={galleryRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value=""; } }}/>
    </div>
  );
}
