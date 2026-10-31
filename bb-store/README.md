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

## Local dev
```
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3001
```
