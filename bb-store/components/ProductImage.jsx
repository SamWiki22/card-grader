import { useEffect, useRef, useState } from "react";

// Inventory photos are served from /api/photo/[id]; items without one get a
// branded placeholder instead of a broken image.
export default function ProductImage({ product, className = "" }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);

  // An error that fires before hydration never reaches onError, so re-check on mount.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) {
    return (
      <div className={`product-img placeholder ${className}`} aria-hidden="true">
        <img src="/logo.png" alt="" />
      </div>
    );
  }
  return (
    <div className={`product-img ${className}`}>
      <img ref={ref} src={`/api/photo/${encodeURIComponent(product.id)}${product.v ? `?v=${product.v}` : ""}`} alt={product.name} loading="lazy" onError={() => setFailed(true)} />
    </div>
  );
}
