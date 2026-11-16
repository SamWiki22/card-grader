import { useEffect, useRef, useState } from "react";

// A Bearded Bear foil pack drawn in CSS, tinted by the tier color.
export default function PackArt({ tier, gameLabel, state = "idle" }) {
  return (
    <div className={`pack pack-${state}`} style={{ "--tier": tier.color }}>
      <div className="pack-crimp top" />
      <div className="pack-body">
        <div className="pack-shine" />
        <img src="/logo.png" alt="" className="pack-logo" />
        <div className="pack-tier">{tier.name}</div>
        <div className="pack-game">{gameLabel}</div>
      </div>
      <div className="pack-crimp bottom" />
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
