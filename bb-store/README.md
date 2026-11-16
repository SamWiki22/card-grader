# Bearded Bear TCG — Online Store

Public storefront for singles and sealed product. It reads straight from the
same Supabase inventory as **BB Inventory**, so there's no second catalog to keep up.

## How listings work
An item shows on the site when, in BB Inventory, it has **quantity > 0** and **price > 0**.
- **Singles** = type "Single" · **Sealed** = "Box" and "Pack"
- The photo you add in BB Inventory becomes the product photo
- Cost, owner, notes and SKU are never sent to shoppers

To hide something, set its price to 0 (or quantity to 0).

## Setup (Vercel)
1. New Vercel project from this repo, **Root Directory = `bb-store`**.
2. Add environment variables (see `.env.example`):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`: same values as BB Inventory's
     `NEXT_PUBLIC_SUPABASE_*`, but **without** the `NEXT_PUBLIC_` prefix here so they stay server-side.
     (The inventory tables accept writes with that key, so it must never reach shoppers' browsers.)
   - `CONTACT_EMAIL`, `INSTAGRAM_URL`, `SITE_URL` (your store's URL).
3. Deploy.

Without Stripe, the cart's button emails you an **order request** (to `CONTACT_EMAIL`).

## Taking card payments (Stripe, optional)
1. Add `STRIPE_SECRET_KEY` (dashboard.stripe.com → Developers → API keys).
2. Stripe → Developers → Webhooks → add endpoint `https://YOUR-SITE/api/stripe-webhook`
   with events `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Shipping: `SHIPPING_FLAT_CENTS` (e.g. `500`), `FREE_SHIPPING_MIN` (e.g. `75`), `LOCAL_PICKUP=true`.

When an order is paid, the webhook subtracts the quantity in inventory and logs the sale in
BB Inventory's sales history as "Website (buyer name)". Stock is re-checked when checkout
starts, but two people could still pay for the last copy at the same moment, so check
stock before you ship and refund if needed.

## Bearded Bear Packs (virtual packs)
Players add funds, open a digital pack, and get one **real card** from that pack's pool.
The card goes to their **Vault**. From there they can keep it, ship it home, or **sell it back**
for a share of market value set by card value in `/admin/packs` (default 75% under $20, rising to 95% at $500+;
any card can have its own %). A sold-back card goes back into its pool.

Market values can be linked to TCGplayer (via tcgcsv.com's free daily mirror). Linked cards and store singles
re-sync every day at 21:30 UTC (`vercel.json` cron → `/api/cron/refresh-prices`, protected by `CRON_SECRET`),
or on demand with **Refresh TCGplayer prices** in admin. Backup price: each card can store its last sale
(eBay, Goldin, Card Ladder, Fanatics Collect, Heritage) with a link. It can be the card's value (graded slabs),
and it's used automatically when TCGplayer has no price. Games: Pokémon, Magic, Dragon Ball (Fusion World and
Masters catalogs) and One Piece each have five tiers.

Pages: `/packs` (open) · `/vault` (cards, sell back, ship) · `/sell` (players sell you cards for pack credit) · `/account` · `/packs/rules` · `/admin/packs`.

### Setup
1. Supabase → SQL Editor → run `supabase/packs.sql` (safe to re-run). It creates the pack tables
   (locked to the public key) and five starter tiers each for Pokémon and One Piece.
2. Supabase → Authentication → Email Templates → **Magic Link**: add `{{ .Token }}` to the email
   body so players get a 6-digit sign-in code.
3. Env vars: `SUPABASE_SERVICE_ROLE_KEY` (required), `ADMIN_EMAILS`, `CRON_SECRET`,
   `VAULT_SHIP_FEE_CENTS`, plus the Stripe keys. Adding funds goes through the same Stripe webhook.
4. Sign in with an admin email, go to `/admin/packs`, and stock each tier's pool (photo, grade, market value).

### Stocking a pool so it makes money
Each card's chance = its weight ÷ the total weight of its pool (weight 1 = normal).
The admin page shows each tier's **average pull value** and **house margin**. Keep the margin
positive (roughly 10–25%) by stocking mostly cards worth a bit under the pack price, with a few
hits. Lower a chase card's weight to make it rarer. The margin moves every time a card is pulled
or sold back, so check it often.

### Before you take real money
- **Legal:** paid random packs with cash-value prizes and buyback can count as gambling or a
  lottery in some states. Talk to a lawyer about age limits, state restrictions and whether you
  need a free way to enter.
- **Payments:** check that your payment processor allows mystery or random packs. Many restrict them.
- Balance is store credit only. There's no cash withdrawal.

## Local dev
```
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3001
```
