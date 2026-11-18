# Putting the Bearded Bear site online

About 1–2 hours the first time. You'll use four websites: **GitHub** (the code), **Supabase** (database
and logins, the same project BB Inventory already uses), **Vercel** (hosting), and **Stripe** (card payments).

---

## Step 1 — Merge the code into `main`
1. Go to github.com/samwiki22/card-grader.
2. Open a pull request from **`claude/bb-store`** into **`main`** (or ask Claude to open it).
3. Click **Merge pull request**.

## Step 2 — Set up the database (Supabase)
1. Go to supabase.com and open the project BB Inventory already uses.
2. Click **SQL Editor** → **New query**.
3. Open `bb-store/supabase/packs.sql` on GitHub, copy all of it, paste it in, and click **Run**.
   You should see "Success. No rows returned". It's safe to run again later.
4. Go to **Project Settings → API** and keep this tab open. You'll copy three values in Step 4:
   - **Project URL**
   - **anon public** key
   - **service_role** key (secret: never post it anywhere or put it in a `NEXT_PUBLIC_` variable)

## Step 3 — Turn on sign-in codes (Supabase)
1. **Authentication → Sign In / Providers**: make sure **Email** is enabled.
2. **Authentication → Email Templates → Magic Link**: replace the body with something like:
   ```
   <h2>Your Bearded Bear sign-in code</h2>
   <p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>
   ```
   and click **Save**.
3. **Send real email.** Supabase's built-in email only sends a few messages per hour.
   - Make a free account at resend.com and verify your domain there.
   - In Supabase, go to **Authentication → Emails → SMTP Settings** and enter the details Resend gives you.
4. **Authentication → URL Configuration**: set **Site URL** to your website address once you have it (Step 6).

## Step 4 — Put the site on Vercel
1. Go to vercel.com and sign in with GitHub.
2. Click **Add New… → Project**, find **card-grader**, and click **Import**.
3. **Root Directory**: click **Edit** and pick **`bb-store`**. This matters: the repo holds several apps.
4. Framework should say **Next.js**. Leave the build settings alone.
5. Open **Environment Variables** and add each of these:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | Project URL from Step 2 |
   | `SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
   | `ADMIN_EMAILS` | your email (comma-separate several) |
   | `SHOP_ADDRESS` | where players mail cards they sell you, lines split with `|` (e.g. `Bearded Bear TCG \| 123 Main St \| City, ST 00000`) |
   | `CRON_SECRET` | any long random string (protects the daily TCGplayer price sync) |
   | `VAULT_SHIP_FEE_CENTS` | `500` (= $5 to ship vault cards) |
   | `SHIPPING_FLAT_CENTS` | `500` (store orders) |
   | `FREE_SHIPPING_MIN` | `75` |
   | `LOCAL_PICKUP` | `true` |
   | `CONTACT_EMAIL` | the shop's email |
   | `INSTAGRAM_URL` | your Instagram link (optional) |
   | `SITE_URL` | leave blank for now; fill in at Step 6 |

6. Click **Deploy**. In about 2 minutes you get a link like `card-grader-xyz.vercel.app`.
   Open it: the store should show your BB Inventory items, and `/packs` should show the tiers.

> Vercel's free **Hobby** plan is for non-commercial sites. Upgrade the project to **Pro**
> (~$20/mo) before you start selling.

## Step 5 — Stock your first pack pool
1. Open `your-site/account`, sign in with the email you put in `ADMIN_EMAILS` and the code it emails you.
2. Go to `your-site/admin/packs`.
3. Click **Pool** next to a tier, then add cards: name, set, grade, market value, and a photo.
4. Watch **House margin** in the tiers table and keep it positive (aim for 10–25%). Mostly stock
   cards worth a bit less than the pack price, plus a few hits.
   Or tap **⚖ Balance to target margin** above the pool: set a margin (15% by default), check the preview, then **Save**.
   Re-run it after restocking, since prices and the pool keep changing.
   On your phone, **📷 Snap card** adds cards from photos, and **📷 Photo pass** photographs cards that are already in the pool.
   The photo is what players see when they pull the card. **🖼 Top pulls preview** makes a shareable image of each pack's best cards.
5. Untick **Live** on tiers you aren't ready to sell, then click **Save**.
6. **Buyback rates** (same page): set what players get back by card value. The defaults are 75% under $20,
   85% from $20, 90% from $100 and 95% from $500. Type a % in a card's **Buyback** box to override it for that card.
7. **TCGplayer prices:** click **Find on TCGplayer** when adding a card. Pick the set, search the name and click
   the printing (Holofoil, Reverse Holo…). Leave "keep synced" ticked and the value updates daily. Use
   **Link** in the **Store singles** table to do the same for singles from BB Inventory.
   Graded slabs: TCGplayer prices raw cards, so for slabs click **Add** under **Last sold** instead. Enter the
   last sale price from eBay, Goldin or Card Ladder (with the link), and tick "Use this sale as the card's value".
   A last sale on a TCGplayer-synced card is kept as its backup price, used whenever TCGplayer has none.

### Player sign-in (passwords)
- **New players:** tap **Create account** and enter an email, a password (8+ characters) and the 18+ box. We email them a
  6-digit code **once** to prove the email is theirs. After that they log in with their email and password.
- **Existing players:** they can set a password on their **Profile** page, or use **Forgot password?** (emails a code and sets a new password).
- **Lockout:** 5 wrong passwords lock that email's password login for 15 minutes. The email code still works.
- **Email link:** "Email me a sign-in link instead" still works for anyone who prefers it.
- **Supabase setting:** in Supabase → Authentication → Sign In / Providers → **Email**, leave sign-in with password **on** (it's on by default).
  Keep `{{ .Token }}` in the Magic Link email template so the code appears.

### Selling vault cards
Any card in a player's vault has a **Sell** button with two choices, both at your buyback rates:
- **Sell into a pack pool:** the card goes back into its pack for someone else to pull.
- **Sell to Bearded Bear:** the card leaves the packs and becomes a store single: quantity 1, priced at its market value,
  cost = what you paid. It shows in BB Inventory and on the site right away. Edit or hide it there if you'd rather not list it.

### Buying cards from players (Sell tab)
Players submit a card from **Sell** with photos, grade and an optional TCGplayer match. In `/admin/packs` → **Card submissions**:
1. Check the photos. Use the **eBay sold** / **Card Ladder** links to price it, enter **Our value**, and the **Offer**
   fills in from your buyback rates (edit it if you like). Then click **Send offer**.
2. The player sees the offer, with a badge on the Sell tab, and accepts or declines.
3. Accepted cards show your `SHOP_ADDRESS` and a code like `BB-7K3QX` to put in the package.
4. When it arrives and matches the photos, pick the pool and click **Card arrived — pay**. The player is credited
   and the card joins the pool with their photo. If it doesn't match, click **Card not as described**.

### Team access (who can get into admin)
- **Owners** (master control): illestcollect@gmail.com and beardedbeartcg@gmail.com are built in, so they can never be
  locked out. Sign in with your email code. Owners can do everything, and only owners can open **/admin/team**.
- **Team accounts:** in **/admin/team**, add someone with a username, a password (tap **Suggest** for one) and an access level:
  - **Staff:** store inventory, recording sales and offers.
  - **Admin:** everything except managing the team.
- **Signing in:** team members tap the **logo at the top left 5 times** (or open any /admin page) and enter their username and password.
- **Managing accounts:** from /admin/team you can reset a password, change access, **Sign out everywhere**, **Disable** or remove someone.
  Changes apply right away, even on a phone that's already signed in. 5 wrong passwords lock that account for 15 minutes.
- **Before first use:** re-run `supabase/packs.sql` once, since it adds the team table.
- The older `ADMIN_EMAILS` / `STAFF_EMAILS` settings in Vercel still work. You can leave them, or move people to team accounts.

### Adding inventory (staff)
Inventory lives at `/admin/store` (the **Admin** / **Inventory** link in the header).
- Give helpers inventory-only access with `STAFF_EMAILS` in Vercel (comma-separated). They can add, edit,
  mark sold and delete items, but can't touch balances, payouts, buyback rates or pack settings.
- **+ Add cards or sealed** → **Find on TCGplayer** → pick the game and set once, search, tap the printing,
  set Qty, Condition and Owner → **Add**. The picker reopens on the same set for the next card.
- Not on TCGplayer? Type the name and set, add your own photo, and enter the price by hand.

### Photo features and daily sales
**📷 Snap to add** (in + Add cards or sealed) and **📷 Record sales** (photos or group-text screenshots of what sold)
read photos with Claude. In Vercel add `ANTHROPIC_API_KEY` (copy it from the old BB Inventory project's settings,
or create one at console.anthropic.com → API Keys). Each photo costs roughly 1–3¢.
- Record sales: upload the photos, check each item's matched card (yellow = needs you to pick), set the price,
  who sold it and the day, then **Record**. Stock goes down and the sale is logged with the photo.
- **Sales** page (`/admin/sales`, admins only): today's total, day-by-day revenue and profit, Sam's and Bear/Umer's
  shares (Shared items split 50/50), every sale with its photo, **Undo** (puts the stock back), and CSV export.

### Using BB Inventory at the booth alongside the website
BB Inventory and the website share the same inventory and sales tables in Supabase, so:
- **Sold at the booth** (BB Inventory → Sell): stock goes down and the item comes off the website once it hits 0.
- **Sold on the website:** stock goes down in BB Inventory within seconds, and the sale shows in its sales history as
  "Website (buyer name)". Pull that item from the booth.
- **Restocked** (BB Inventory + / − or Edit): the website shows the new stock right away.

Every stock change from either app adds or subtracts. It only saves if nobody else changed the number in between, and retries
if they did, so a booth sale and a website sale at the same moment are both counted.
(Before the Nov 2026 update, BB Inventory saved "set stock to the number on my screen", which could erase a website sale.
**Redeploy BB Inventory too:** in Vercel, open the BB Inventory project → Deployments → ⋯ → Redeploy, after merging.)

**Don't run `supabase/lock-down.sql` while you use BB Inventory.** It switches off BB Inventory's access to the inventory.

**Keep the BB Inventory link private.** BB Inventory has no login: anyone with its link can change stock and prices, and
those changes show on the website. Don't post the link, and remove people's access by changing the Supabase anon key if it leaks.
The website's **/admin/store** (Inventory, 📷 Record sales, Sales) does the same jobs behind a sign-in. Staff get access through
`STAFF_EMAILS`, so it's the safer option for helpers.

## Step 6 — Your own domain (optional)
1. In Vercel, open the project, go to **Settings → Domains**, and add e.g. `beardedbeartcg.com`.
2. Vercel shows one or two DNS records. Add them where you bought the domain (GoDaddy, Namecheap, etc.).
   It can take up to an hour to work.
3. Set `SITE_URL` to `https://beardedbeartcg.com` in **Settings → Environment Variables**, then
   **Deployments → ⋯ → Redeploy**.
4. In Supabase, set **Authentication → URL Configuration → Site URL** to the same address.

## Step 7 — Card payments (Stripe)
Start in **test mode** so no real money moves.
1. Go to dashboard.stripe.com, turn on **Test mode**, then open **Developers → API keys** and copy the
   **Secret key** (starts with `sk_test_`).
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR-SITE/api/stripe-webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Save, then copy the **Signing secret** (starts with `whsec_`).
3. In Vercel, add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then redeploy.
4. Test it: on `/packs` tap **+ Add funds** and pay with card `4242 4242 4242 4242`, any future
   date and any CVC. Your balance should go up within a few seconds. Also test a store order.
5. When everything works, repeat steps 1–3 with **live** keys (`sk_live_…`) and a live webhook.

## Before you take real money
- [ ] Ask Stripe (or your processor) whether they allow paid random packs. Many don't, and they can freeze the account.
- [ ] Have a lawyer check the pack system for your state (gambling and sweepstakes rules, age limit, which states to block).
- [ ] Every live tier has a positive house margin.
- [ ] You've opened a pack, sold a card back, and requested shipping yourself with test money.
- [ ] Upgrade to Vercel Pro and Supabase Pro.

## After updating the site: re-run packs.sql
Some updates change the database functions as well as the site. Whenever one does (like the Nov 2026 fix that stops
two pack openings from colliding), open Supabase → **SQL Editor**, paste all of `bb-store/supabase/packs.sql`, and click **Run**.
It's safe to run again. It doesn't touch your cards, balances or tiers.

**Checking the counts:** paste `bb-store/supabase/check-pools.sql` into the SQL Editor and run it. It's read-only. The first table shows
how many cards each pack has in the pool, in vaults, shipping and removed. Every other result should be empty. If one isn't,
it lists the cards or players whose records don't add up.

## When something goes wrong
- **Store is empty:** check `SUPABASE_URL` / `SUPABASE_ANON_KEY`, and that items have quantity and price above 0.
- **"Packs are coming soon":** `SUPABASE_SERVICE_ROLE_KEY` is missing, or `packs.sql` wasn't run.
- **No sign-in email:** set up SMTP (Step 3), and check spam.
- **Paid but balance didn't change:** in Stripe, open **Webhooks** and check the endpoint's recent deliveries for errors.
- **Vercel logs:** project → **Logs** shows server errors.
