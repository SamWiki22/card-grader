import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useCart } from "../../lib/cart";

export default function Success() {
  const { query } = useRouter();
  const { clear } = useCart();
  useEffect(() => { clear(); }, []);
  return (
    <Layout title="Thank you">
      <div className="card">
        <h1>Payment received. Thank you!</h1>
        {query.order && <p>Order <code>{String(query.order).slice(0, 8)}</code>. A receipt is on its way to your email.</p>}
        <Link href="/" className="btn">Back to the shop</Link>
      </div>
    </Layout>
  );
}
