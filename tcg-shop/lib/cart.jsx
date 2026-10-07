import { createContext, useContext, useEffect, useState, useCallback } from "react";

// Cart lives in localStorage: [{ kind, id, name, price, quantity, max }]. Prices here are for
// display only — /api/checkout re-prices everything from the database.
const CartContext = createContext(null);
const KEY = "tcg-shop-cart";

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem(KEY)) || []); } catch (_) {}
  }, []);
  const save = useCallback(next => {
    setItems(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) {}
  }, []);

  const add = (item, qty = 1) => {
    const i = items.findIndex(x => x.kind === item.kind && x.id === item.id);
    if (i === -1) save([...items, { ...item, quantity: Math.min(qty, item.max ?? qty) }]);
    else save(items.map((x, j) => (j === i ? { ...x, ...item, quantity: Math.min(x.quantity + qty, item.max ?? 99) } : x)));
  };
  const setQty = (kind, id, quantity) =>
    save(quantity <= 0 ? items.filter(x => !(x.kind === kind && x.id === id)) : items.map(x => (x.kind === kind && x.id === id ? { ...x, quantity } : x)));
  const clear = () => save([]);
  const count = items.reduce((s, x) => s + x.quantity, 0);
  const total = items.reduce((s, x) => s + x.quantity * (x.price || 0), 0);

  return <CartContext.Provider value={{ items, add, setQty, clear, count, total }}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
