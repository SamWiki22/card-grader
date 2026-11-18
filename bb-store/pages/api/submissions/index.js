import { randomBytes } from "crypto";
import { requireUser } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { getBalance } from "../../../lib/packs";
import { marketCents } from "../../../lib/tcg";
import { GAMES } from "../../../lib/shared";

export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

const OPEN = ["submitted", "offered", "accepted"];
const MAX_OPEN = 15;
const MAX_PHOTO = 2_500_000; // characters of data URL (~1.8 MB image)
const PUBLIC_COLS = "id,kind,game,name,set_name,card_number,grade,asking_cents,note,tcg_product_id,market_cents,offer_cents,admin_note,status,created_at,updated_at";

// Unambiguous characters for codes people write on a package.
function code() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "BB-" + [...randomBytes(5)].map(b => A[b % A.length]).join("");
}
const photo = v => (typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length <= MAX_PHOTO ? v : null);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const { data, error } = await db.from("submissions").select(PUBLIC_COLS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (error) { console.error(error); return res.status(500).json({ error: "Couldn’t load your submissions." }); }
    return res.json({ submissions: data, shipTo: (process.env.SHOP_ADDRESS || "").split("|").map(s => s.trim()).filter(Boolean) });
  }

  if (req.method !== "POST") return res.status(405).end();
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 120);
  const front = photo(b.photo_front);
  if (!GAMES.some(g => g.id === b.game)) return res.status(400).json({ error: "Pick a game." });
  if (!name) return res.status(400).json({ error: "Enter the card name." });
  if (!front) return res.status(400).json({ error: "Add a photo of the front of the card." });
  if (b.photo_back && !photo(b.photo_back)) return res.status(400).json({ error: "The back photo couldn’t be read — try another one." });

  const { data: open } = await db.from("submissions").select("id").eq("user_id", user.id).in("status", OPEN);
  if ((open || []).length >= MAX_OPEN) return res.status(429).json({ error: `You have ${MAX_OPEN} cards waiting already — let us catch up first.` });

  // "vault": the player keeps the card; they mail it in and it lands in their vault (no offer step).
  const kind = b.kind === "vault" ? "vault" : "sale";
  const t = b.tcg?.productId ? b.tcg : null;
  let market = null;
  if (t) market = await marketCents(Number(t.categoryId), Number(t.groupId), Number(t.productId), String(t.subType || "")).catch(() => null);
  const asking = Number(b.asking) > 0 ? Math.round(Number(b.asking) * 100) : null;

  await getBalance(user.id, user.email); // make sure the profile exists
  const row = {
    id: code(),
    user_id: user.id,
    game: b.game,
    name,
    set_name: String(b.set_name || "").trim().slice(0, 120),
    card_number: String(b.card_number || "").trim().slice(0, 40),
    grade: String(b.grade || "").trim().slice(0, 40),
    kind,
    status: kind === "vault" ? "accepted" : "submitted",
    asking_cents: kind === "vault" ? null : asking,
    note: String(b.note || "").trim().slice(0, 500),
    photo_front: front,
    photo_back: photo(b.photo_back),
    tcg_category_id: t ? Number(t.categoryId) : null,
    tcg_group_id: t ? Number(t.groupId) : null,
    tcg_product_id: t ? Number(t.productId) : null,
    tcg_subtype: t ? String(t.subType || "").slice(0, 40) : null,
    market_cents: market,
  };
  const { error } = await db.from("submissions").insert(row);
  if (error) { console.error(error); return res.status(500).json({ error: "Couldn’t save your submission. Try again." }); }
  res.json({ id: row.id });
}
