// Browser-only photo helpers for admin pages.

// Shrink a photo to max `max` px as a JPEG data URL. Browsers apply the phone's
// rotation flag when drawing, so the result comes out upright.
export function shrink(src, max = 900, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      if (typeof src !== "string") URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("That file isn’t a photo we can read."));
    img.src = typeof src === "string" ? src : URL.createObjectURL(src);
  });
}

// A pool card's photo URL; `v` busts caches after the photo changes.
export const cardPhotoUrl = c => `/api/pack-photo/${encodeURIComponent(c.id)}${c.updated_at ? `?v=${encodeURIComponent(c.updated_at)}` : ""}`;
