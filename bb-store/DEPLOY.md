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
5. Untick **Live** on tiers you aren't ready to sell, then click **Save**.
6. **Buyback rates** (same page): set what players get back by card value. The defaults are 75% under $20,
   85% from $20, 90% from $100 and 95% from $500. Type a % in a card's **Buyback** box to override it for that card.
7. **TCGplayer prices:** click **Find on TCGplayer** when adding a card. Pick the set, search the name and click
   the printing (Holofoil, Reverse Holo…). Leave "keep synced" ticked and the value updates daily. Use
   **Link** in the **Store singles** table to do the same for singles from BB Inventory.
   Graded slabs: TCGplayer prices raw cards, so for slabs click **Add** under **Last sold** instead. Enter the
   last sale price from eBay, Goldin or Card Ladder (with the link), and tick "Use this sale as the card's value".
   A last sale on a TCGplayer-synced card is kept as its backup price, used whenever TCGplayer has none.

### Buying cards from players (Sell tab)
Players submit a card from **Sell** with photos, grade and an optional TCGplayer match. In `/admin/packs` → **Card submissions**:
1. Check the photos. Use the **eBay sold** / **Card Ladder** links to price it, enter **Our value**, and the **Offer**
   fills in from your buyback rates (edit it if you like). Then click **Send offer**.
2. The player sees the offer, with a badge on the Sell tab, and accepts or declines.
3. Accepted cards show your `SHOP_ADDRESS` and a code like `BB-7K3QX` to put in the package.
4. When it arrives and matches the photos, pick the pool and click **Card arrived — pay**. The player is credited
   and the card joins the pool with their photo. If it doesn't match, click **Card not as described**.

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

## When something goes wrong
- **Store is empty:** check `SUPABASE_URL` / `SUPABASE_ANON_KEY`, and that items have quantity and price above 0.
- **"Packs are coming soon":** `SUPABASE_SERVICE_ROLE_KEY` is missing, or `packs.sql` wasn't run.
- **No sign-in email:** set up SMTP (Step 3), and check spam.
- **Paid but balance didn't change:** in Stripe, open **Webhooks** and check the endpoint's recent deliveries for errors.
- **Vercel logs:** project → **Logs** shows server errors.
