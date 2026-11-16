import Link from "next/link";
import Layout from "../../components/Layout";
import { BUYBACK_PERCENT, SHIP_FEE_CENTS } from "../../lib/packs";
import { centsToMoney } from "../../lib/shared";

export default function Rules({ buyback, shipFee, contactEmail }) {
  return (
    <Layout title="Pack rules & odds">
      <section className="wrap section prose">
        <h1 className="page-title">Pack rules &amp; odds</h1>

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
        <p>Any card in your vault can be sold back at any time for <b>{buyback}% of its listed market value</b>, credited to your balance immediately. We set market values from recent sales and update them over time.</p>

        <h2>Shipping</h2>
        <p>Select cards in your vault and request shipping to a US address. {shipFee ? `Shipping is ${centsToMoney(shipFee)} per request.` : "Shipping is free."} Shipped cards are the exact cards shown in your vault.</p>

        <h2>The fine print</h2>
        <ul>
          <li>You must be 18 or older.</li>
          <li>Opened packs can’t be refunded; the card you pull is yours.</li>
          <li>Balance is credit for Bearded Bear Packs. It isn’t a bank account and doesn’t earn interest.</li>
          <li>Questions or problems? {contactEmail ? <a href={`mailto:${contactEmail}`}>Email us</a> : "Contact us"} and we’ll make it right.</li>
        </ul>
        <p><Link href="/packs" className="btn">Back to packs</Link></p>
      </section>
    </Layout>
  );
}

export async function getStaticProps() {
  return { props: { buyback: BUYBACK_PERCENT, shipFee: SHIP_FEE_CENTS, contactEmail: process.env.CONTACT_EMAIL || "" }, revalidate: 3600 };
}
