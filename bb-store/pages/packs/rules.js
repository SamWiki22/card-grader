import Link from "next/link";
import AppShell from "../../components/AppShell";
import { getBuybackRules, SHIP_FEE_CENTS } from "../../lib/packs";
import { centsToMoney } from "../../lib/shared";

export default function Rules({ rules, shipFee, contactEmail }) {
  return (
    <AppShell title="Odds & rules">
      <section className="app-prose">
        <h1>Odds &amp; rules</h1>

        <h2>How it works</h2>
        <ol>
          <li>Add funds to your balance with a card.</li>
          <li>Pick a game and a pack tier, then open it. You get one real card from that pack’s pool.</li>
          <li>Your card goes to your vault. Keep it, ship it to yourself, or sell it back.</li>
        </ol>

        <h2>Odds</h2>
        <p>Every pack shows its odds live, worked out from the cards actually in its pool at that moment. Each card in a pool has a set chance of being pulled, and the odds table adds those up by value range. When a card is pulled the pool and odds update. When someone sells a card back, it goes back into the pool.</p>
        <p>Each pull is drawn on our server using a cryptographically secure random number, and every pull is logged with that number.</p>

        <h2>Selling back</h2>
        <p>Any card in your vault can be sold back at any time and the credit lands in your balance right away. The higher a card’s market value, the bigger the share you get back:</p>
        <ul className="app-list buyback-table">
          {rules.map((r, i) => {
            const next = rules[i + 1];
            const range = next ? `${centsToMoney(r.min_value_cents)} – ${centsToMoney(next.min_value_cents - 1)}` : `${centsToMoney(r.min_value_cents)} and up`;
            return <li key={r.min_value_cents}><span>{range}</span><b>{r.percent}%</b></li>;
          })}
        </ul>
        <p>Market values follow TCGplayer market prices for most cards and update daily. Some graded or rare cards are priced by hand and may have their own buyback rate, shown before you sell.</p>

        <h2>Shipping</h2>
        <p>Select cards in your vault and request shipping to a US address. {shipFee ? `Shipping is ${centsToMoney(shipFee)} per request.` : "Shipping is free."} Shipped cards are the exact cards shown in your vault.</p>

        <h2>The fine print</h2>
        <ul>
          <li>You must be 18 or older.</li>
          <li>Opened packs can’t be refunded; the card you pull is yours.</li>
          <li>Balance is credit for Bearded Bear Packs. It isn’t a bank account and doesn’t earn interest.</li>
          <li>Questions or problems? {contactEmail ? <a href={`mailto:${contactEmail}`}>Email us</a> : "Contact us"} and we’ll make it right.</li>
        </ul>
        <Link href="/packs" className="buy-btn narrow"><span>Back to packs</span></Link>
      </section>
    </AppShell>
  );
}

export async function getStaticProps() {
  let rules = [{ min_value_cents: 0, percent: 75 }];
  try { rules = await getBuybackRules(); } catch (e) { console.error(e); }
  return { props: { rules, shipFee: SHIP_FEE_CENTS, contactEmail: process.env.CONTACT_EMAIL || "" }, revalidate: 600 };
}
