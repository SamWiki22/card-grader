import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// { [deckId]: open pre-order copies } — used to apply per-deck pre-order caps on the storefront.
export function usePreorderCounts() {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("preorder_open_counts").then(({ data }) => {
      setCounts(Object.fromEntries((data || []).map(r => [r.deck_id, r.open_copies])));
    });
  }, []);
  return counts;
}
