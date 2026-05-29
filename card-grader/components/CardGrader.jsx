import { useState, useRef, useCallback } from "react";

const WEIGHTS = { centering: 0.20, corners: 0.30, edges: 0.25, surface: 0.25 };

const PG_TIERS = [
  { min: 9.80, label: "Black Label",    short: "BLACK LABEL", color: "#FFD700", badge: "🏆", likely: "BGS 10 Black Label",  verdict: "Near-perfect card. Extremely likely to achieve BGS 10 Black Label." },
  { min: 9.40, label: "Pristine 10",    short: "PRISTINE",    color: "#E8E8E8", badge: "💎", likely: "BGS 10 Pristine",     verdict: "Exceptional quality. Strong candidate for BGS Pristine 10." },
  { min: 9.00, label: "Gem Mint 9.5",   short: "GEM MINT",    color: "#64B5F6", badge: "⭐", likely: "BGS 9.5 Gem Mint",   verdict: "Very strong card. Likely grades BGS 9.5 Gem Mint." },
  { min: 8.50, label: "Near Mint-Mint", short: "NM-MT",       color: "#81C784", badge: "✅", likely: "BGS 8–8.5",          verdict: "Solid card with minor flaws. Likely BGS 8 or 8.5." },
  { min: 7.50, label: "Near Mint",      short: "NEAR MINT",   color: "#FFB74D", badge: "📋", likely: "BGS 7–7.5",          verdict: "Noticeable wear in at least one area. Likely BGS 7–7.5." },
  { min: 0,    label: "Below NM",       short: "BELOW NM",    color: "#EF5350", badge: "⚠️", likely: "BGS 6 or lower",     verdict: "Significant defects found. Not a premium grade candidate." },
];

const CATEGORIES = [
  {
    id: "centering", label: "Centering", icon: "⊞", weight: "20%",
    tip: "Lay card on white paper. Stand directly above.",
    instruction: "Full card visible — all 4 borders in frame.",
    prompt: "You are a professional trading card grader. Analyze this card image for centering. Look at the 4 border widths. Score 10=perfect 50/50, 9.5=55/45, 9=60/40, 8=65/35, 7=70/30 or worse. Respond with ONLY a JSON object: {\"score\":8.5,\"leftRight\":\"52/48\",\"topBottom\":\"50/50\",\"verdict\":\"one sentence\",\"defects\":[]}",
  },
  {
    id: "surface", label: "Surface", icon: "◈", weight: "25%",
    tip: "Use 2x zoom. Angled light reveals scratches.",
    instruction: "Macro close-up of card face.",
    prompt: "You are a professional trading card grader. Analyze this card image for surface defects: scratches, print lines, cloudiness, stains, indentations, gloss loss. Score 10=flawless, 9.5=only under magnification, 9=very minor, 8=minor visible, 7=moderate. Respond with ONLY a JSON object: {\"score\":9.0,\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}",
  },
  {
    id: "corners", label: "Corners", icon: "◢", weight: "30%",
    tip: "Tilt card under direct light to reveal corner wear.",
    instruction: "All 4 corners or macro of worst corner.",
    prompt: "You are a professional trading card grader. Analyze this card image for corner condition: fraying, nicks, rounding, creases, ink wear at tips. Score 10=needle sharp all 4, 9.5=one barely off, 9=minor wear 1-2, 8=soft corners, 7=worn/frayed. Respond with ONLY a JSON object: {\"score\":9.5,\"worstCorner\":\"TR\",\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}",
  },
  {
    id: "edges", label: "Edges", icon: "▬", weight: "25%",
    tip: "Hold card edge-on toward light to show chipping.",
    instruction: "Side-on view of all edges.",
    prompt: "You are a professional trading card grader. Analyze this card image for edge condition: chipping, nicks, roughness, whitening, dents. Score 10=razor clean, 9.5=only under magnification, 9=minor nicks, 8=visible chipping, 7=moderate. Respond with ONLY a JSON object: {\"score\":9.0,\"worstEdge\":\"Bottom\",\"verdict\":\"one sentence\",\"defects\":[\"defect 1\"]}",
  },
];

function getTier(score) {
  return PG_TIERS.find(t => score >= t.min) || PG_TIERS[PG_TIERS.length - 1];
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
          worstCorner: obj.worstCorner || null,
          worstEdge: obj.worstEdge || null,
        };
      }
    } catch (_) {}
  }
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return { score: m ? Math.min(10, Math.max(1, parseFloat(m[1]))) : 7, verdict: text.slice(0, 150), defects: [] };
}

async function toJpegBase64(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function buildShareText(pgScore, tier, cardName, scores) {
  return [
    "🃏 PRE-GRADE REPORT — " + (cardName || "Trading Card"), "",
    "📊 PG Score: " + pgScore.toFixed(1) + "/10 " + tier.badge,
    "🏷️ Prediction: " + tier.likely, "",
    "Subgrades:",
    "  ⊞ Centering : " + (scores.centering != null ? scores.centering.toFixed(1) : "—") + "/10",
    "  ◈ Surface   : " + (scores.surface   != null ? scores.surface.toFixed(1)   : "—") + "/10",
    "  ◢ Corners   : " + (scores.corners   != null ? scores.corners.toFixed(1)   : "—") + "/10",
    "  ▬ Edges     : " + (scores.edges     != null ? scores.edges.toFixed(1)     : "—") + "/10", "",
    '"' + tier.verdict + '"', "",
    "#CardGrading #BGS #Beckett #TradingCards",
  ].join("\n");
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

function CaptureCard({ cat, captured, onCapture }) {
  const cameraRef = useRef();
  const galleryRef = useRef();
  const [preview, setPreview]     = useState(captured?.preview || null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult]       = useState(captured?.result || null);
  const [error, setError]         = useState(null);
  const [showMenu, setShowMenu]   = useState(false);

  const sc = result == null ? "#555" : result.score >= 9 ? "#4CAF50" : result.score >= 7.5 ? "#FFD700" : "#EF5350";

  function reset() { setPreview(null); setResult(null); setError(null); setShowMenu(false); }

  const analyze = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read file.");
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setPreview(dataUrl);
      setAnalyzing(true);
      try {
        const base64 = await toJpegBase64(dataUrl);
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
        const parsed = parseResponse(text);
        setResult(parsed);
        onCapture({ preview: dataUrl, result: parsed });
      } catch (err) {
        setError(err.message || "Analysis failed.");
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }, [cat, onCapture]);

  return (
    <div style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${result != null ? sc + "44" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: 16, position: "relative", marginBottom: 14 }}>
      <div style={{ position: "absolute", top: 12, right: 12, fontSize: 9, letterSpacing: 1, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.05)", borderRadius: 4, padding: "2px 6px" }}>{cat.weight} WEIGHT</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>{cat.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2 }}>{cat.label}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{cat.instruction}</div>
        </div>
        {result != null && (
          <div style={{ textAlign: "right", marginRight: 44 }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: sc }}>{result.score.toFixed(1)}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>/10</span>
          </div>
        )}
      </div>

      {preview == null ? (
        <div style={{ border: "1.5px dashed rgba(255,215,0,0.2)", borderRadius: 10, padding: "20px 12px", textAlign: "center", background: "rgba(255,215,0,0.015)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>{cat.label} Photo</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => cameraRef.current?.click()} style={{ flex: 1, maxWidth: 140, padding: "10px 8px", borderRadius: 9, background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)", color: "#FFD700", fontSize: 12 }}>📷 Camera</button>
            <button onClick={() => galleryRef.current?.click()} style={{ flex: 1, maxWidth: 140, padding: "10px 8px", borderRadius: 9, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.65)", fontSize: 12 }}>🖼️ Upload</button>
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,215,0,0.35)", marginTop: 10 }}>💡 {cat.tip}</div>
        </div>
      ) : (
        <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
          <img src={preview} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />
          {analyzing && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, border: "3px solid rgba(255,215,0,0.2)", borderTopColor: "#FFD700", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <div style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.6)" }}>ANALYZING</div>
            </div>
          )}
          {!analyzing && !showMenu && (
            <button onClick={() => setShowMenu(true)} style={{ position: "absolute", top: 7, right: 7, background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.8)", borderRadius: 6, padding: "3px 10px", fontSize: 10 }}>Replace ▾</button>
          )}
          {showMenu && !analyzing && (
            <div style={{ position: "absolute", top: 7, right: 7, display: "flex", flexDirection: "column", gap: 4 }}>
              <button onClick={() => { setShowMenu(false); cameraRef.current?.click(); }} style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,215,0,0.3)", color: "#FFD700", borderRadius: 6, padding: "4px 10px", fontSize: 10 }}>📷 Camera</button>
              <button onClick={() => { setShowMenu(false); galleryRef.current?.click(); }} style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.7)", borderRadius: 6, padding: "4px 10px", fontSize: 10 }}>🖼️ Upload</button>
              <button onClick={reset} style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(239,83,80,0.3)", color: "#EF9A9A", borderRadius: 6, padding: "4px 10px", fontSize: 10 }}>✕ Clear</button>
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color: "#EF5350", fontSize: 11, marginTop: 8, textAlign: "center" }}>{error}</div>}

      {result != null && !analyzing && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 9 }}>
          <MiniBar score={result.score} color={sc} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 7, lineHeight: 1.5 }}>{result.verdict}</div>
          {result.leftRight && (
            <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              L/R <span style={{ color: "#FFD700" }}>{result.leftRight}</span>{"  "}
              T/B <span style={{ color: "#FFD700" }}>{result.topBottom}</span>
            </div>
          )}
          {result.defects?.filter(d => d && d !== "None").length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
              {result.defects.filter(d => d && d !== "None").map((d, i) => (
                <span key={i} style={{ fontSize: 9, padding: "2px 7px", background: "rgba(239,83,80,0.12)", border: "1px solid rgba(239,83,80,0.25)", borderRadius: 20, color: "#EF9A9A" }}>{d}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value = ""; } }} />
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files?.[0]) { analyze(e.target.files[0]); e.target.value = ""; } }} />
    </div>
  );
}

function SharePanel({ pgScore, tier, scores, cardName, images }) {
  const [copied, setCopied] = useState(false);
  const [platform, setPlatform] = useState("fb");
  const fullText  = buildShareText(pgScore, tier, cardName, scores);
  const shortText = `🃏 PG Score: ${pgScore.toFixed(1)}/10 — ${tier.likely} ${tier.badge}\n"${tier.verdict}"\n#CardGrading #BGS #Beckett`;

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
      {images.filter(Boolean).length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
          {CATEGORIES.map((cat, i) => images[i] ? (
            <div key={cat.id} style={{ flexShrink: 0, textAlign: "center" }}>
              <img src={images[i]} alt={cat.label} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,215,0,0.2)" }} />
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{cat.label.toUpperCase()}</div>
            </div>
          ) : null)}
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
  const [captures, setCaptures] = useState({});
  const [cardName, setCardName] = useState("");

  const handleCapture = useCallback((catId, data) => {
    setCaptures(prev => ({ ...prev, [catId]: data }));
  }, []);

  const rawScores = {
    centering: captures.centering?.result?.score ?? null,
    surface:   captures.surface?.result?.score   ?? null,
    corners:   captures.corners?.result?.score   ?? null,
    edges:     captures.edges?.result?.score     ?? null,
  };
  const pgScore = calcPGScore(rawScores);
  const tier = pgScore != null ? getTier(pgScore) : null;
  const completedCount = Object.values(rawScores).filter(v => v != null).length;
  const allComplete = completedCount === 4;
  const images = CATEGORIES.map(c => captures[c.id]?.preview ?? null);

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#fff", fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { cursor: pointer; }
      `}</style>

      <div style={{ position: "relative", padding: "36px 20px 24px", textAlign: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,215,0,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ fontSize: 10, letterSpacing: 5, color: "rgba(255,215,0,0.5)", marginBottom: 6 }}>PRE-GRADE SCORE SYSTEM</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, letterSpacing: 4, lineHeight: 0.95, background: "linear-gradient(180deg,#fff 0%,#aaa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CARD GRADER</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8, letterSpacing: 1 }}>AI-POWERED · BECKETT BLACK PREDICTOR · PG SCORE™</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 18 }}>
          {CATEGORIES.map(c => { const s = rawScores[c.id]; const col = s == null ? "rgba(255,255,255,0.1)" : s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350"; return <div key={c.id} style={{ width: 32, height: 3, borderRadius: 2, background: col, transition: "background 0.5s" }} />; })}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 6 }}>{completedCount} of 4 categories analyzed</div>
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        <input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Card name (e.g. 2003 LeBron James Topps Chrome RC #111)"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#fff", outline: "none", fontFamily: "'DM Sans', sans-serif" }} />
      </div>

      {pgScore != null && tier != null && (
        <div style={{ margin: "0 16px 20px", padding: 18, background: "rgba(255,215,0,0.03)", border: `1px solid ${tier.color}28`, borderRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <ScoreRing score={pgScore} size={96} color={tier.color} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: tier.color, lineHeight: 1 }}>{pgScore.toFixed(1)}</div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>PG SCORE</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 19, color: tier.color, letterSpacing: 1 }}>{tier.badge} {tier.short}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>Likely: <strong style={{ color: tier.color }}>{tier.likely}</strong></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {CATEGORIES.map(c => { const s = rawScores[c.id]; if (s == null) return null; const col = s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350"; return <span key={c.id} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 20, background: `${col}18`, border: `1px solid ${col}40`, color: col }}>{c.label} {s.toFixed(1)}</span>; })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 16px" }}>
        {CATEGORIES.map(cat => (
          <CaptureCard key={cat.id} cat={cat} captured={captures[cat.id]} onCapture={data => handleCapture(cat.id, data)} />
        ))}
      </div>

      {allComplete && tier != null && (
        <div style={{ padding: "0 16px" }}>
          <div style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${tier.color}40`, borderRadius: 18, padding: "22px 20px" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 11, letterSpacing: 4, color: `${tier.color}80`, marginBottom: 16 }}>FINAL PRE-GRADE REPORT</div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 18 }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <ScoreRing score={pgScore} size={116} color={tier.color} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, color: tier.color, lineHeight: 1 }}>{pgScore.toFixed(1)}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>OUT OF 10</div>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: tier.color, letterSpacing: 1 }}>{tier.badge} {tier.label}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, marginBottom: 8 }}>{tier.verdict}</div>
                <span style={{ fontSize: 11, padding: "4px 12px", background: `${tier.color}18`, border: `1px solid ${tier.color}40`, borderRadius: 20, color: tier.color }}>Predicted: {tier.likely}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {CATEGORIES.map(c => { const s = rawScores[c.id]; const col = s >= 9 ? "#4CAF50" : s >= 7.5 ? "#FFD700" : "#EF5350"; return (
                <div key={c.id} style={{ padding: "11px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: `1px solid ${col}2a` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.icon} {c.label.toUpperCase()}</span>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: col }}>{s.toFixed(1)}</span>
                  </div>
                  <MiniBar score={s} color={col} />
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Weight: {c.weight}</div>
                </div>
              ); })}
            </div>
            {images.filter(Boolean).length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>SUBMITTED PHOTOS</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {CATEGORIES.map((c, i) => images[i] ? (
                    <div key={c.id} style={{ flex: 1, textAlign: "center" }}>
                      <img src={images[i]} alt={c.label} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }} />
                      <div style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{c.label.toUpperCase()}</div>
                    </div>
                  ) : null)}
                </div>
              </div>
            )}
          </div>
          <SharePanel pgScore={pgScore} tier={tier} scores={rawScores} cardName={cardName} images={images} />
        </div>
      )}
    </div>
  );
}
