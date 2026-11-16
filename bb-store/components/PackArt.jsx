import { useEffect, useRef, useState } from "react";

// A foil booster pack drawn in CSS: textured silver foil, iridescent streaks,
// crimped ends, the Bearded Bear logo, and "GAME · TIER" across the bottom.
export default function PackArt({ tier, gameLabel, state = "idle" }) {
  return (
    <div className={`foil-pack foil-${state}`} style={{ "--tier": tier.color }}>
      <div className="foil-crimp top" />
      <div className="foil-body">
        <span className="streak s1" /><span className="streak s2" /><span className="streak s3" /><span className="streak s4" />
        <div className="foil-sheen" />
        <img src="/logo.png" alt="" className="foil-logo" />
        <div className="foil-caption">{gameLabel} · {tier.name}</div>
      </div>
      <div className="foil-crimp bottom" />
    </div>
  );
}

export function CardImage({ card, className = "" }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);
  // An error that fires before hydration never reaches onError, so re-check on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <div className={`slab ${className}`}>
      {failed
        ? <div className="slab-fallback"><img src="/logo.png" alt="" /></div>
        : <img ref={ref} src={`/api/pack-photo/${encodeURIComponent(card.id)}`} alt={card.name} loading="lazy" onError={() => setFailed(true)} />}
      {card.grade && <span className="slab-grade">{card.grade}</span>}
    </div>
  );
}
