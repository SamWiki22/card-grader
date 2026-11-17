// Server-only helpers for customer offers.
import { db } from "./catalog";

export const OFFER_HOURS = 48;

// Price per item the customer can buy at right now, or null.
export function offerPrice(o) {
  if (!o) return null;
  if (o.expires_at && Date.parse(o.expires_at) < Date.now()) return null;
  if (o.status === "accepted") return o.counter_cents ?? o.amount_cents;
  return null;
}

export async function getOffer(id) {
  const { data } = await db.from("offers").select("*").eq("id", String(id || "")).maybeSingle();
  if (data && ["accepted", "countered"].includes(data.status) && data.expires_at && Date.parse(data.expires_at) < Date.now()) {
    await db.from("offers").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", data.id).eq("status", data.status);
    return { ...data, status: "expired" };
  }
  return data;
}

// What the customer is allowed to see.
export const publicOffer = o => o && ({
  id: o.id, item_id: o.item_id, item_name: o.item_name, list_price: Number(o.list_price), quantity: o.quantity,
  amount_cents: Number(o.amount_cents), counter_cents: o.counter_cents == null ? null : Number(o.counter_cents),
  admin_note: o.admin_note, status: o.status, expires_at: o.expires_at, created_at: o.created_at,
});
