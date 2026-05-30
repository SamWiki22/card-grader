import { useState, useRef, useCallback } from "react";

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
      { min: 9.50, short: "GEM MT 10",  color: "#FFD700", badge: "🏆", likely: "PSA 10 Gem Mint",  verdict: "Near-perfect card. Strong PSA 10 candidate." },
      { min: 9.00, short: "MINT 9",     color: "#E8E8E8", badge: "💎", likely: "PSA 9 Mint",       verdict: "Excellent with minimal flaws. Likely PSA 9." },
      { min: 8.50, short: "NM-MT 8",    color: "#64B5F6", badge: "⭐", likely: "PSA 8 NM-MT",      verdict: "Very nice card. Likely PSA 8." },
      { min: 7.50, short: "NM 7",       color: "#81C784", badge: "✅", likely: "PSA 7 NM",         verdict: "Solid with minor wear. Likely PSA 7." },
      { min: 6.50, short: "EX-MT 6",    color: "#FFB74D", badge: "📋", likely: "PSA 5–6",          verdict: "Noticeable wear. Likely PSA 5 or 6." },
      { min: 0,    short: "BELOW EX",   color: "#EF5350", badge: "⚠️", likely: "PSA 4 or lower",   verdict: "Significant wear or defects. PSA 4 or lower." },
    ],
  },
  SGC: {
    name: "SGC", color: "#1E88E5",
    tiers: [
      { min: 9.70, short: "PRISTINE 10", color: "#FFD700", badge: "🏆", likely: "SGC 10 Pristine", verdict: "Near-flawless. Strong SGC 10 Pristine candidate." },
      { min: 9.20, short: "MINT+ 9.5",  color: "#E8E8E8", badge: "💎", likely: "SGC 9.5 Mint+",   verdict: "Exceptional quality. Likely SGC 9.5 Mint+." },
      { min: 8.80, short: "MINT 9",     color: "#64B5F6", badge: "⭐", likely: "SGC 9 Mint",       verdict: "Very strong card. Likely SGC 9 Mint." },
      { min: 8.00, short: "NM-MT 8",    color: "#81C784", badge: "✅", likely: "SGC 8–8.5",        verdict: "Solid with minor imperfections. Likely SGC 8 or 8.5." },
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
      { min: 0,    short: "BELOW NM",     color: "#EF5350", badge: "⚠️", likely: "TAG 6 or lower",   verdict: "Significant defects. Not a premium grade candidate." },
    ],
  },
  CGC: {
    name: "CGC", color: "#AB47BC",
    tiers: [
      { min: 9.70, short: "PRISTINE 10",  color: "#FFD700", badge: "🏆", likely: "CGC 10 Pristine",  verdict: "Flawless card. Strong CGC 10 Pristine candidate." },
      { min: 9.20, short: "GEM MINT 9.5", color: "#E8E8E8", badge: "💎", likely: "CGC 9.5 Gem Mint", verdict: "Exceptional quality. Likely CGC 9.5 Gem Mint." },
      { min: 8.80, short: "MINT 9",       color: "#64B5F6", badge: "⭐", likely: "CGC 9 Mint",       verdict: "Very strong card. Likely CGC 9 Mint." },
      { min: 8.20, short: "NM/MT+ 8.5",   color: "#81C784", badge: "✅", likely: "CGC 8.5 NM/MT+",  verdict: "Solid card with minor flaws. Likely CGC 8.5." },
      { min: 7.50, short: "NM/MT 8",      color: "#FFB74D", badge: "📋", likely: "CGC 7.5–8",        verdict: "Noticeable wear. Likely CGC 7.5–8." },
      { min: 0,    short: "BELOW NM",     color: "#EF5350", badge: "⚠️", likely: "CGC 7 or lower",   verdict: "Significant defects found. CGC 7 or lower." },
    ],
  },
};

const PHOTO_TIPS = [
  { icon: "☀️", title: "Lighting", text: "Use natural light or a lamp — no flash. Flash creates glare that hides surface defects, especially on holo/foil cards." },
  { icon: "📐", title: "Angle", text: "Shoot straight down, not at an angle. All 4 borders must be visible for accurate centering analysis." },
  { icon: "⬜", title: "Background", text: "Lay the card on a plain white surface. White contrast helps the AI detect edge wear and corner fraying." },
  { icon: "🔍", title: "Distance", text: "Fill ~80% of the frame with the card. Too far = AI misses corner detail. Too close = borders get cut off." },
  { icon: "🎴", title: "Pokémon Holos", text: "For holo/foil cards tilt slightly until the glare disappears before shooting. Glare masks surface defects." },
  { icon: "📸", title: "Focus", text: "Tap to focus on the card before shooting. A blurry photo will produce unreliable grades." },
];

const CATEGORIES = [
  { id: "centering", label: "Centering", icon: "⊞", weight: "20%", prompt: "You are a professional trading card grader. Analyze this card image for centering. Look at the 4 border widths. Score 10=perfect 50/50, 9.5=55/45, 9=60/40, 8=65/35, 7=70/30 or worse. Respond with ONLY a JSON object: {\"score\":8.5,\"leftRight\":\"52/48\",\"topBottom\":\"50/50\",\"verdict\":\"one sentence\",\"defects\":[]}" },
  { id: "surface",   label: "Surface",   icon: "◈", weight: "25%", prompt: "You are a professional trading card grader. Analyze this card image for surface defects: scratches, print lines, cloudiness, stains, indentations, gloss loss. Score 10=flawless, 9.5=only under magnification, 9=very minor, 8=minor visible, 7=moderate. Respond with ONLY a JSON object: {\"score\":9.0,\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}" },
  { id: "corners",   label: "Corners",   icon: "◢", weight: "30%", prompt: "You are a professional trading card grader. Analyze this card image for corner condition: fraying, nicks, rounding, creases, ink wear at tips. Score 10=needle sharp all 4, 9.5=one barely off, 9=minor wear 1-2, 8=soft corners, 7=worn/frayed. Respond with ONLY a JSON object: {\"score\":9.5,\"worstCorner\":\"TR\",\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}" },
  { id: "edges",     label: "Edges",     icon: "▬", weight: "25%", prompt: "You are a professional trading card grader. Analyze this card image for edge condition: chipping, nicks, roughness, whitening, dents. Score 10=razor clean, 9.5=only under magnification, 9=minor nicks, 8=visible chipping, 7=moderate. Respond with ONLY a JSON object: {\"score\":9.0,\"worstEdge\":\"Bottom\",\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}" },
];

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

function buildShareText(pgScore, tier, cardName, scores, company) {
  return [
    `🃏 PRE-GRADE REPORT — ${cardName || "Trading Card"}`, "",
    `📊 PG Score: ${pgScore.toFixed(1)}/10 ${tier.badge}`,
    `🏷️ Prediction: ${tier.likely}`, "",
    "Subgrades:",
    `  ⊞ Centering : ${scores.centering != null ? scores.centering.toFixed(1) : "—"}/10`,
    `  ◈ Surface   : ${scores.surface   != null ? scores.surface.toFixed(1)   : "—"}/10`,
    `  ◢ Corners   : ${scores.corners   != null ? scores.corners.toFixed(1)   : "—"}/10`,
    `  ▬ Edges     : ${scores.edges     != null ? scores.edges.toFixed(1)     : "—"}/10`, "",
    `"${tier.verdict}"`, "",
    `#CardGrading #${company} #PokemonCards #TradingCards`,
  ].join("\n");
}

function CardIcon({ size = 48, color = "#FFD700" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="4" width="36" height="40" rx="4" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" strokeOpacity="0.6"/>
      <rect x="10" y="8" width="28" height="20" rx="2" fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1" strokeOpacity="0.3"/>
      <circle cx="24" cy="18" r="6" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" strokeOpacity="0.5"/>
      <line x1="10" y1="33" x2="38" y2="33" stroke={color} strokeWidth="1.5" strokeOpacity="0.4"/>
      <line x1="10" y1="38" x2="30" y2="38" stroke={color} strokeWidth="1.5" strokeOpacity="0.3"/>
    </svg>
  );
}

function ScoreRing({ score, size, color }) {
  const sw = 7, r = (size - sw * 2) / 2, circ = 2 * Math.PI * r;
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end", padding: "0" }} onClick={onClose}>
      <div style={{ width: "100%", background: "#0f0f1a", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 3, color: "#FFD700" }}>📸 PHOTO GUIDE</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>Close</button>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.6, padding: "12px", background: "rgba(255,215,0,0.05)", borderRadius: 10, border: "1px solid rgba(255,215,0,0.15)" }}>
          The AI analyzes one photo for all 4 grades simultaneously. The better your photo, the more accurate the grade. One sharp, well-lit front photo is all you need.
        </div>
        {PHOTO_TIPS.map((tip, i) => (
          <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16, padding: "14px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 24, flexShrink: 0 }}>{tip.icon}</div>
            <div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 1, color: "#FFD700", marginBottom: 4 }}>{tip.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{tip.text}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 20, padding: "16px", background: "rgba(255,215,0,0.05)", borderRadius: 12, border: "1px solid rgba(255,215,0,0.2)" }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 2, color: "#FFD700", marginBottom: 10 }}>HOW GRADES WORK</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
            The AI grades 4 categories: <strong style={{ color: "rgba(255,255,255,0.8)" }}>Centering (20%)</strong>, <strong style={{ color: "rgba(255,255,255,0.8)" }}>Surface (25%)</strong>, <strong style={{ color: "rgba(255,255,255,0.8)" }}>Corners (30%)</strong>, and <strong style={{ color: "rgba(255,255,255,0.8)" }}>Edges (25%)</strong>. These are weighted and combined into a PG Score, then mapped to whichever grading company you selected. This is a <em>pre-grade estimate</em> — actual grades may vary based on grader judgment and lighting conditions.
          </div>
        </div>
      </div>
    </div>
  );
}

function SharePanel({ pgScore, tier, scores, cardName, preview, company }) {
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState("fb");
  const fullText = buildShareText(pgScore, tier, cardName, scores, company);
  const shortText = `🃏 PG Score: ${pgScore.toFixed(1)}/10 — ${tier.likely} ${tier.badge}\n"${tier.verdict}"\n#CardGrading #${company} #PokemonCards`;

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 18, padding: 20, marginTop: 20 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, letterSpacing: 3, color: "rgba(255,215,0,0.7)", marginBottom: 14 }}>📤 SHARE YOUR RESULTS</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["fb","Facebook"],["x","X / Twitter"],["full","Full Report"]].map(([k,l]) => (
          <button key={k} onClick={() => setPlatform(k)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 11, background: platform===k ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${platform===k ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)"}`, color: platform===k ? "#FFD700" : "rgba(255,255,255,0.5)" }}>{l}</button>
        ))}
      </div>
      {preview && (
        <div style={{ marginBottom: 14 }}>
          <img src={preview} alt="Card" style={{ width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, border: "1px solid rgba(255,215,0,0.2)" }} />
        </div>
      )}
      <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <pre style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.75)", whiteSpace: "pre-wrap", lineHeight: 1.7, fontFamily: "monospace" }}>{platform === "x" ? shortText : fullText}</pre>
      </div>
      <button onClick={() => copy(platform === "x" ? shortText : fullText)} style={{ width: "100%", padding: 13, borderRadius: 10, fontSize: 13, fontWeight: 600, letterSpacing: 1, background: copied ? "rgba(76,175,80,0.2)" : "rgba(255,215,0,0.12)", border: `1px solid ${copied ? "rgba(76,175,80,0.5)" : "rgba(255,215,0,0.35)"}`, color: copied ? "#81C784" : "#FFD700" }}>
        {copied ? "✓ COPIED TO CLIPBOARD" : "📋 COPY POST TEXT"}
      </button>
    </div>
  );
}

export default function CardGrader() {
  const [company, setCompany]     = useState("BGS");
  const [cardName, setCardName]   = useState("");
  const [preview, setPreview]     = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress]   = useState({});
  const [results, setResults]     = useState({});
  const [error, setError]         = useState(null);
  const [showTips, setShowTips]   = useState(false);
  const cameraRef = useRef();
  const galleryRef = useRef();

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
  const companyColor = COMPANIES[company].color;

  const analyze = useCallback(async (file) => {
    if (!file) return;
    setError(null); setResults({}); setProgress({});
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

  function reset() { setPreview(null); setResults({}); setProgress({}); setError(null); }

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#fff", fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { cursor: pointer; }
      `}</style>

      {showTips && <TipsModal onClose={() => setShowTips(false)} />}

      {/* Header */}
      <div style={{ position: "relative", padding: "36px 20px 28px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 100% 80% at 50% 0%, rgba(255,215,0,0.09) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 1, height: "100%", background: "linear-gradient(to bottom, rgba(255,215,0,0.15), transparent)", pointerEvents: "none" }} />
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <CardIcon size={52} color="#FFD700" />
        </div>
        <div style={{ fontSize: 10, letterSpacing: 5, color: "rgba(255,215,0,0.5)", marginBottom: 6 }}>PRE-GRADE SCORE SYSTEM</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 5, lineHeight: 0.95, background: "linear-gradient(180deg,#ffffff 0%,#aaaaaa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CARD GRADER</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 10, letterSpacing: 1 }}>AI-POWERED · MULTI-COMPANY · PG SCORE™</div>
        <button onClick={() => setShowTips(true)} style={{ marginTop: 14, padding: "7px 18px", borderRadius: 20, background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)", color: "rgba(255,215,0,0.7)", fontSize: 11, letterSpacing: 1 }}>
          📸 PHOTO TIPS & HOW IT WORKS
        </button>
      </div>

      <div style={{ padding: "0 16px 16px" }}>

        {/* Company Selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>SELECT GRADING COMPANY</div>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(COMPANIES).map(([key, co]) => (
              <button key={key} onClick={() => setCompany(key)} style={{ flex: 1, padding: "10px 2px", borderRadius: 10, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, background: company === key ? `${co.color}18` : "rgba(255,255,255,0.03)", border: `1.5px solid ${company === key ? co.color + "70" : "rgba(255,255,255,0.07)"}`, color: company === key ? co.color : "rgba(255,255,255,0.3)", transition: "all 0.2s" }}>{key}</button>
            ))}
          </div>
        </div>

        {/* Card Name */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Card name (e.g. Charizard Base Set Holo #4)"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#fff", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
        </div>

        {/* Upload Area */}
        {!preview ? (
          <div style={{ border: "1.5px dashed rgba(255,215,0,0.2)", borderRadius: 16, padding: "36px 20px", textAlign: "center", background: "linear-gradient(135deg, rgba(255,215,0,0.02) 0%, rgba(255,255,255,0.01) 100%)", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <CardIcon size={56} color="#FFD700" />
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 3, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>UPLOAD CARD PHOTO</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 24, lineHeight: 1.6 }}>One photo · All 4 grades analyzed simultaneously<br/>Centering · Surface · Corners · Edges</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 }}>
              <button onClick={() => cameraRef.current?.click()} style={{ flex: 1, maxWidth: 160, padding: "13px 8px", borderRadius: 12, background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.35)", color: "#FFD700", fontSize: 13, fontWeight: 600 }}>📷 Camera</button>
              <button onClick={() => galleryRef.current?.click()} style={{ flex: 1, maxWidth: 160, padding: "13px 8px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600 }}>🖼️ Upload</button>
            </div>
            <button onClick={() => setShowTips(true)} style={{ fontSize: 11, color: "rgba(255,215,0,0.4)", background: "none", border: "none", textDecoration: "underline" }}>How to take the best photo →</button>
          </div>
        ) : (
          <div style={{ marginBottom: 16, position: "relative" }}>
            <img src={preview} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", display: "block", background: "rgba(255,255,255,0.02)" }} />
            {!analyzing && (
              <button onClick={reset} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.8)", border: "1px solid rgba(239,83,80,0.4)", color: "#EF9A9A", borderRadius: 8, padding: "5px 12px", fontSize: 11 }}>✕ New Photo</button>
            )}
          </div>
        )}

        {error && (
          <div style={{ color: "#EF9A9A", fontSize: 12, marginBottom: 14, padding: "10px 14px", background: "rgba(239,83,80,0.08)", borderRadius: 10, border: "1px solid rgba(239,83,80,0.2)", lineHeight: 1.5 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Analysis Grid */}
        {(analyzing || completedCount > 0) && (
          <>
            {analyzing && (
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: "rgba(255,215,0,0.6)" }}>
                  ANALYZING {completedCount}/4 COMPLETE…
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
                  {CATEGORIES.map(c => (
                    <div key={c.id} style={{ width: 40, height: 3, borderRadius: 2, background: progress[c.id] === "done" ? "#4CAF50" : progress[c.id] === "analyzing" ? "#FFD700" : "rgba(255,255,255,0.1)", transition: "background 0.4s" }} />
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {CATEGORIES.map(cat => {
                const res = results[cat.id];
                const prog = progress[cat.id];
                const s = res?.score;
                const col = s == null ? "rgba(255,255,255,0.15)" : s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350";
                return (
                  <div key={cat.id} style={{ padding: "14px 12px", background: res ? `linear-gradient(135deg, ${col}08 0%, rgba(0,0,0,0) 100%)` : "rgba(255,255,255,0.02)", borderRadius: 14, border: `1px solid ${res ? col + "40" : "rgba(255,255,255,0.06)"}`, transition: "all 0.4s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 16 }}>{cat.icon}</span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginLeft: 5, letterSpacing: 1 }}>{cat.label.toUpperCase()}</span>
                      </div>
                      {prog === "analyzing" && <div style={{ width: 16, height: 16, border: "2px solid rgba(255,215,0,0.2)", borderTopColor: "#FFD700", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                      {prog === "done" && s != null && <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: col, lineHeight: 1 }}>{s.toFixed(1)}</span>}
                      {prog === "error" && <span style={{ fontSize: 10, color: "#EF5350" }}>ERR</span>}
                    </div>
                    {s != null && <MiniBar score={s} color={col} />}
                    {res?.verdict && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5 }}>{res.verdict}</div>}
                    {res?.leftRight && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>L/R <span style={{ color: "#FFD700" }}>{res.leftRight}</span></div>}
                    {res?.defects?.filter(d => d && d !== "None").length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }}>
                        {res.defects.filter(d => d && d !== "None").map((d, i) => (
                          <span key={i} style={{ fontSize: 8, padding: "2px 6px", background: "rgba(239,83,80,0.1)", border: "1px solid rgba(239,83,80,0.2)", borderRadius: 20, color: "#EF9A9A" }}>{d}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.18)", marginTop: 6, letterSpacing: 1 }}>WEIGHT {cat.weight}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Live Score (partial) */}
        {pgScore != null && tier != null && !allComplete && (
          <div style={{ padding: 18, background: `linear-gradient(135deg, ${tier.color}08 0%, rgba(0,0,0,0) 100%)`, border: `1px solid ${tier.color}28`, borderRadius: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ScoreRing score={pgScore} size={82} color={tier.color} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: tier.color, lineHeight: 1 }}>{pgScore.toFixed(1)}</div>
                  <div style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>LIVE</div>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 17, color: tier.color, letterSpacing: 1 }}>{tier.badge} {tier.short}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Likely: <strong style={{ color: tier.color }}>{tier.likely}</strong></div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", marginTop: 2 }}>{completedCount} of 4 grades in…</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Final Report */}
      {allComplete && tier != null && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ background: `linear-gradient(135deg, ${tier.color}08 0%, rgba(8,8,16,0.95) 60%)`, border: `1px solid ${tier.color}35`, borderRadius: 20, padding: "24px 20px" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 10, letterSpacing: 4, color: `${tier.color}70`, marginBottom: 18 }}>FINAL PRE-GRADE REPORT · {COMPANIES[company].name.toUpperCase()}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ScoreRing score={pgScore} size={120} color={tier.color} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: tier.color, lineHeight: 1 }}>{pgScore.toFixed(1)}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>OUT OF 10</div>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: tier.color, letterSpacing: 1, marginBottom: 4 }}>{tier.badge} {tier.short}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, marginBottom: 10 }}>{tier.verdict}</div>
                <span style={{ fontSize: 11, padding: "5px 14px", background: `${tier.color}15`, border: `1px solid ${tier.color}35`, borderRadius: 20, color: tier.color }}>Predicted: {tier.likely}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {CATEGORIES.map(c => {
                const s = rawScores[c.id];
                const col = s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350";
                return (
                  <div key={c.id} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid ${col}20` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.icon} {c.label.toUpperCase()}</span>
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: col }}>{s.toFixed(1)}</span>
                    </div>
                    <MiniBar score={s} color={col} />
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Weight: {c.weight}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <SharePanel pgScore={pgScore} tier={tier} scores={rawScores} cardName={cardName} preview={preview} company={company} />
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value = ""; } }} />
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value = ""; } }} />
    </div>
  );
}
