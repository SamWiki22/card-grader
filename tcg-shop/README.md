# TCG Shop: singles + pre-built tournament decks

A storefront for selling TCG singles and pre-built copies of current tournament decks, with an
admin area to net-deck top lists, see what singles you're missing, and assemble decks from stock.

**Live games:** One Piece, Gundam Card Game, Dragon Ball Super Fusion World, Union Arena, Riftbound.
**Prepped, not live:** Magic: The Gathering. Visible in admin so you can stock it ahead of time; turn it
on with `NEXT_PUBLIC_LIVE_GAMES` (see `.env.example`) or by changing its status in `lib/games.js`.

**Card IDs:** for One Piece, Gundam, Fusion World and Union Arena, stock singles with the card ID in the
*Number / card ID* field (e.g. `OP05-119`, `GD01-001`, `FB01-001`, `UE01BT/JJK-1-001`). Decklists for these
games are usually card IDs, and many cards share a name, so decks link to singles by ID.

Same stack as `bb-inventory`: Next.js (pages router) + Supabase. Payments via Stripe Checkout (optional).

## Setup
1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Create your login in Supabase → Authentication → Users, then grant it admin:
   `insert into admins (user_id) select id from auth.users where email = 'you@example.com';`
3. Copy `.env.example` to `.env.local` and fill it in. On Vercel, set the same variables and set the
   project's Root Directory to `tcg-shop`.
4. `npm install && npm run dev`, then open http://localhost:3000/admin.

Stripe is optional. Without it, checkout records a **pending payment** order; you collect payment
yourself and click *Mark paid* in Admin → Orders, which takes the items out of stock. With Stripe, add a
webhook to `https://<your-site>/api/stripe-webhook` for `checkout.session.completed`.

## Workflow: from a tournament result to a deck on the shelf
1. **Admin → Meta Decks**
   * *Tournament results*: for games with events on play.limitlesstcg.com, load recent events, open the
     top finishers, and **Import** a list. The game code is the `game=` value in the Limitless URL when
     you filter by game; the admin remembers it per game.
   * *Paste a decklist*: any game. Use the Export/Copy button on the deck site (links shown per game).
     Understood: Bandai card-ID lists (`4xOP01-016`, `4 Nami (OP01-016)`, Union Arena `UE01BT/JJK-1-001`)
     with Leader / Main Deck / Resource Deck sections, Riftbound lists with Legend / Champion / MainDeck /
     Battlefields / Runes sections, MTG Arena/MTGO, and plain `4 Card Name`.
   Imports become **draft** decks credited to the player, placing and event.
2. **Admin → Decks**: each card is auto-linked to your singles inventory. The table shows
   need/have/short; **Copy buy list** gives you exactly what to source.
3. **Admin → Singles Inventory**: add singles one at a time, or bulk-paste the buy list when the
   cards arrive. Back on the deck, click **Re-match to inventory**.
4. **Build N**: pulls the singles out of inventory (all-or-nothing) and adds N built copies to the
   shelf. Set a fixed price or let it price from singles minus a discount, then tick **Published**.

Customers can buy the whole pre-built deck or any of its cards as singles.

## Pre-orders: sell the deck before you build it
On a deck, tick **Take pre-orders when sold out** and optionally set a cap and a ship date. When the deck
has no built copies, the store shows **Pre-order this deck**; customers pay up front.
Also set **Newest set in deck** + release date: decks are sorted newest set first and get a
*New* / *Upcoming* badge, and the home page has a *Pre-order now* row.

**Admin → Pre-orders & Sourcing** is the weekly loop:
1. **Build queue**: per deck, paid pre-orders + your *keep on shelf* target − built copies = copies to build.
2. **Shopping list**: every card needed across all those decks, pooled (a staple in five decks shows once),
   minus singles on hand, split into **Bulk / cheap** (under a price you set), **Staples**, and
   **Not stocked yet**. **Copy list** gives `qty name` lines for TCGplayer Mass Entry, so its optimizer
   picks the cheapest printing.
3. When cards arrive: bulk-add them in Singles Inventory → **Build N** on the deck → **Fill pre-orders
   from shelf** (oldest order first) → ship from the Orders tab.

## Running it inside an existing site (Illestcollect)
* **Subdomain** (simplest): deploy this folder as its own Vercel project and point e.g.
  `shop.illestcollect.com` at it. Link to it from the main site's nav.
* **Path on the main domain**: set `NEXT_PUBLIC_BASE_PATH=/shop`, deploy, then add a rewrite on the main
  site so `illestcollect.com/shop/*` proxies to this deployment. For a Next.js main site:
  `rewrites: () => [{ source: "/shop/:path*", destination: "https://<this-deployment>/shop/:path*" }]`.
* Set `NEXT_PUBLIC_SHOP_NAME=Illestcollect` for the header and page titles.

## Notes
* Decklists are public tournament results; each deck credits its source. Use the export
  buttons or official APIs rather than scraping sites whose terms forbid it.
* Card names and set codes are factual, but card **images** are copyrighted. Use your own photos, or
  images from an API whose terms allow commercial display.
* `npm test` runs the decklist parser, matching, pricing, pre-order, sourcing and Stripe signature tests.
