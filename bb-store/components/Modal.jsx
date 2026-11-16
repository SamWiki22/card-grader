import { useEffect } from "react";

export default function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        {onClose && <button className="modal-close" onClick={onClose} aria-label="Close">×</button>}
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
