import Link from "next/link";
import { useEffect } from "react";
import Layout from "../components/Layout";
import { useCart } from "../lib/cart";

export default function Success() {
  const { clear, ready } = useCart();
  useEffect(() => { if (ready) clear(); }, [ready, clear]);
  return (
    <Layout title="Thank you">
      <section className="wrap section empty">
        <img src="/logo.png" alt="" width="140" height="140" />
        <h1 className="page-title">Thanks for your order!</h1>
        <p>A receipt is on its way to your email. We’ll let you know when it ships (or when it’s ready for pickup).</p>
        <div className="hero-ctas center"><Link href="/shop" className="btn">Keep shopping</Link></div>
      </section>
    </Layout>
  );
}
