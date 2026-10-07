import { supabase, fetchAll } from "./supabaseClient";
import { matchDeck } from "./match";

export async function loadInventory(game) {
  return fetchAll(() => supabase.from("cards").select("id,name,set_code,number,quantity,price").eq("game", game).order("id"));
}

// Creates an unpublished deck from parsed/normalized decklist entries and links each card to
// singles inventory where possible. Returns the new deck id.
export async function importDeck({ game, name, cards, ...meta }) {
  if (!cards?.length) throw new Error("Decklist has no cards");
  const { data: deck, error } = await supabase
    .from("decks")
    .insert({ game, name: name || "Untitled deck", published: false, ...meta })
    .select("id")
    .single();
  if (error) throw error;

  const matched = matchDeck(cards, await loadInventory(game));
  const rows = matched.map((c, i) => ({
    deck_id: deck.id,
    section: c.section || "main",
    count: c.count,
    name: c.name,
    set_code: c.set_code || "",
    number: c.number || "",
    card_id: c.card_id,
    sort: i,
  }));
  const { error: e2 } = await supabase.from("deck_cards").insert(rows);
  if (e2) {
    await supabase.from("decks").delete().eq("id", deck.id);
    throw e2;
  }
  return deck.id;
}

// Re-link every card in a deck against current inventory (after restocking singles).
export async function rematchDeck(deckId, game) {
  const { data: dcs, error } = await supabase.from("deck_cards").select("*").eq("deck_id", deckId);
  if (error) throw error;
  const matched = matchDeck(dcs, await loadInventory(game));
  const changed = matched.filter((m, i) => m.card_id !== dcs[i].card_id);
  for (const m of changed) {
    const { error: e } = await supabase.from("deck_cards").update({ card_id: m.card_id }).eq("id", m.id);
    if (e) throw e;
  }
  return changed.length;
}
