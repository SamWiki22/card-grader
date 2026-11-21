// Shipping rules, shared by the cart page (to explain them) and checkout (to enforce them).
//
//  • Bulk = a single priced under the bulk line (default $2).
//  • Orders that are ALL bulk singles: $5 minimum to ship, and a cheap untracked
//    envelope option (default $1.99, up to 20 cards).
//  • Anything else ships tracked (default $5). Free shipping at $75+.
//  • Store pickup at Toyland Marketplace (Booth 11, Ontario) is always free and has no minimum.
//
// Defaults are built in; each can be changed with a Vercel setting (see shippingConfig).

const DEFAULTS = {
  bulkMaxCents: 200,
  minOrderCents: 500,
  envelopeCents: 199,
  envelopeMaxCards: 20,
  trackedCents: 500,
  freeMinCents: 7500,
  pickup: true,
  pickupName: "Toyland Marketplace, Booth 11, Ontario",
  pickupAddress: "2401 S Vineyard Ave, Unit B, Ontario, CA 91761",
};

const dollars = v => (v === undefined || v === "" || isNaN(Number(v)) ? undefined : Math.round(Number(v) * 100));
const cents = v => (v === undefined || v === "" || isNaN(Number(v)) ? undefined : Math.round(Number(v)));
const pick = (...vals) => vals.find(v => v !== undefined);

// Server-only: read overrides from environment variables.
export function shippingConfig(env = process.env) {
  return {
    bulkMaxCents: pick(dollars(env.BULK_MAX_PRICE), DEFAULTS.bulkMaxCents),
    minOrderCents: pick(dollars(env.BULK_MIN_ORDER), DEFAULTS.minOrderCents),
    envelopeCents: pick(cents(env.ENVELOPE_SHIPPING_CENTS), DEFAULTS.envelopeCents),
    envelopeMaxCards: pick(cents(env.ENVELOPE_MAX_CARDS), DEFAULTS.envelopeMaxCards),
    trackedCents: pick(cents(env.SHIPPING_FLAT_CENTS), DEFAULTS.trackedCents),
    freeMinCents: pick(dollars(env.FREE_SHIPPING_MIN), DEFAULTS.freeMinCents),
    pickup: env.LOCAL_PICKUP !== "false",
    pickupName: env.PICKUP_LOCATION || DEFAULTS.pickupName,
    pickupAddress: env.PICKUP_ADDRESS || DEFAULTS.pickupAddress,
  };
}

// lines: [{ type, priceCents, qty }]. Returns what shipping this order can have.
export function shippingPlan(lines, cfg) {
  const subtotalCents = lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const cards = lines.reduce((s, l) => s + l.qty, 0);
  const bulkOnly = lines.length > 0 && lines.every(l => l.type === "single" && l.priceCents < cfg.bulkMaxCents);
  const free = cfg.freeMinCents > 0 && subtotalCents >= cfg.freeMinCents;
  const shortCents = bulkOnly && !free ? Math.max(0, cfg.minOrderCents - subtotalCents) : 0;

  const options = [];
  if (!shortCents) {
    if (free) options.push({ id: "free", name: "Free tracked shipping", cents: 0 });
    else {
      if (bulkOnly && cards <= cfg.envelopeMaxCards) options.push({ id: "envelope", name: "Envelope (untracked)", cents: cfg.envelopeCents });
      options.push({ id: "tracked", name: "Tracked shipping", cents: cfg.trackedCents });
    }
  }
  if (cfg.pickup) options.push({ id: "pickup", name: `Store pickup — ${cfg.pickupName}`, cents: 0 });

  return { subtotalCents, cards, bulkOnly, free, shortCents, canShip: !shortCents, options };
}
