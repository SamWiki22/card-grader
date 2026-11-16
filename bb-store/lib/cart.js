import { createContext, useContext, useEffect, useState, useCallback } from "react";

// The cart lives in this shopper's browser only. Prices and stock are always
// re-checked on the server at checkout, so nothing here is trusted.
const KEY = "bb-store-cart-v1";
const CartContext = createContext(null);

function load() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(lines) {
  try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]); // [{ id, name, set, price, stock, qty, type, condition }]
  const [ready, setReady] = useState(false);

  useEffect(() => { setLines(load()); setReady(true); }, []);
  useEffect(() => { if (ready) save(lines); }, [lines, ready]);

  const add = useCallback((p, qty = 1) => {
    setLines(prev => {
      const existing = prev.find(l => l.id === p.id);
      if (existing) return prev.map(l => l.id === p.id ? { ...l, qty: Math.min(p.stock, l.qty + qty) } : l);
      return [...prev, { id: p.id, name: p.name, set: p.set, price: p.price, stock: p.stock, type: p.type, condition: p.condition, qty: Math.min(p.stock, qty) }];
    });
  }, []);
  const setQty = useCallback((id, qty) => {
    setLines(prev => prev.flatMap(l => l.id !== id ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(l.stock, qty) }]));
  }, []);
  const remove = useCallback(id => setLines(prev => prev.filter(l => l.id !== id)), []);
  const clear = useCallback(() => setLines([]), []);
  const replace = useCallback(next => setLines(next), []);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  return (
    <CartContext.Provider value={{ lines, ready, add, setQty, remove, clear, replace, count, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
