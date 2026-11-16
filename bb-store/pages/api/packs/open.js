import { randomBytes } from "crypto";
import { requireUser, friendlyError } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { getBalance, getBuybackRules, buybackPercent, buybackCents } from "../../../lib/packs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const user = await requireUser(req, res);
  if (!user) return;
  await getBalance(user.id, user.email); // makes sure the profile row exists

  // Uniform roll in [0,1) from 48 bits of the OS's cryptographic RNG.
  const roll = randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  const { data, error } = await db.rpc("open_pack", { p_user: user.id, p_tier: String(req.body?.tier || ""), p_roll: roll });
  if (error) {
    const f = friendlyError(error);
    if (f) return res.status(f.status).json({ error: f.message });
    console.error(error);
    return res.status(500).json({ error: "Something went wrong opening that pack. You weren’t charged." });
  }
  const { data: card } = await db.from("pack_cards").select("buyback_percent").eq("id", data.card.id).maybeSingle();
  const pct = buybackPercent(data.card.market_value_cents, card?.buyback_percent ?? null, await getBuybackRules());
  res.json({ ...data, buyback_cents: buybackCents(data.card.market_value_cents, pct), buyback_percent: pct });
}
