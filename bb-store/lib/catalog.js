// Server-only access to the shared bb-inventory Supabase tables.
// Only import this from getServerSideProps or /pages/api — never from a component.
import { createClient } from "@supabase/supabase-js";
import { GAMES } from "./shared";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

export const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

// Supabase returns at most 1,000 rows per request; this pages through all of them.
// `build` returns a fresh query each time, e.g. () => db.from("items").select("id").order("id").
export async function selectAll(build, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    out.push(...data);
    if (data.length < pageSize) return { data: out, error: null };
  }
}

const GAME_KEYWORDS = {
  pokemon: ["pokemon", "pokémon"], mtg: ["magic", "mtg"], onepiece: ["one piece"],
  dbs: ["dragon ball", "dragonball"], gundam: ["gundam"], unionarena: ["union arena"],
};

// Public columns only: cost, owner, notes, sku and low_stock never leave the server.
const PUBLIC_COLUMNS = "id,type,game,name,set_name,condition,quantity,price,created_at,updated_at";

function inferGame(row) {
  if (row.game && GAMES.some(g => g.id === row.game)) return row.game;
  const text = `${row.set_name || ""} ${row.name || ""}`.toLowerCase();
  for (const [id, kws] of Object.entries(GAME_KEYWORDS)) if (kws.some(k => text.includes(k))) return id;
  return "other";
}

export function toProduct(row) {
  return {
    id: row.id,
    type: row.type,
    category: row.type === "single" ? "singles" : "sealed",
    game: inferGame(row),
    name: row.name || "Untitled",
    set: row.set_name || "",
    condition: row.condition || "",
    stock: Math.max(0, row.quantity || 0),
    price: Number(row.price) || 0,
    createdAt: row.created_at || null,
    // Changes when a photo is replaced (e.g. rotated), so browsers fetch the new one.
    v: row.updated_at ? new Date(row.updated_at).getTime() : 0,
  };
}

// Everything that's in stock and has a price is for sale.
export async function listProducts() {
  if (!db) return [];
  const { data, error } = await db
    .from("items")
    .select(PUBLIC_COLUMNS)
    .gt("quantity", 0)
    .gt("price", 0)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toProduct);
}

export async function getProduct(id) {
  if (!db) return null;
  const { data, error } = await db.from("items").select(PUBLIC_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toProduct(data) : null;
}

export async function getProductsByIds(ids) {
  if (!db || !ids.length) return [];
  const { data, error } = await db.from("items").select(PUBLIC_COLUMNS).in("id", ids);
  if (error) throw error;
  return data.map(toProduct);
}

export function shopInfo() {
  return {
    configured: !!db,
    checkoutEnabled: !!process.env.STRIPE_SECRET_KEY,
    contactEmail: process.env.CONTACT_EMAIL || "",
    instagramUrl: process.env.INSTAGRAM_URL || "",
    freeShippingMin: Number(process.env.FREE_SHIPPING_MIN) || 0,
  };
}
