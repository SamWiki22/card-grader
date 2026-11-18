// Server-side: change a store item's stock by `delta` without overwriting a
// change made elsewhere at the same moment (BB Inventory at the booth, another
// checkout). Compare-and-set with retries; BB Inventory uses the same method
// (bb-inventory/lib/stock.js). Returns the new quantity.
export async function changeQty(db, id, delta, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise(r => setTimeout(r, Math.random() * 40 * Math.min(i, 5)));
    const { data: cur, error } = await db.from("items").select("quantity").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!cur) throw new Error(`Item ${id} not found`);
    const next = Math.max(0, Math.round(Number(cur.quantity) + delta));
    if (next === cur.quantity) return next;
    const { data: done, error: upErr } = await db.from("items")
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq("id", id).eq("quantity", cur.quantity).select("id");
    if (upErr) throw upErr;
    if (done?.length) return next;
  }
  throw new Error(`Stock for item ${id} kept changing`);
}
