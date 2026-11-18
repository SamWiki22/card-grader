// Change an item's stock by `delta` without overwriting a change made somewhere
// else at the same moment (a website sale, another phone at the booth).
// Reads the current quantity, writes current + delta only if it's still that
// number, and retries if it moved in between. The website's Stripe webhook and
// admin use the same compare-and-set, so neither side can erase the other's sale.
// Returns the new quantity.
export async function changeQty(supabase, id, delta, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    // Back off a little (with jitter) after a collision so busy moments sort themselves out.
    if (i) await new Promise(r => setTimeout(r, Math.random() * 40 * Math.min(i, 5)));
    const { data: cur, error } = await supabase.from("items").select("quantity").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!cur) throw new Error("That item no longer exists.");
    const next = Math.max(0, Math.round(Number(cur.quantity) + delta));
    if (next === cur.quantity) return next;
    const { data: done, error: upErr } = await supabase.from("items")
      .update({ quantity: next, updated_at: new Date().toISOString() })
      .eq("id", id).eq("quantity", cur.quantity).select("id");
    if (upErr) throw upErr;
    if (done?.length) return next;
  }
  throw new Error("Stock kept changing — try again.");
}
