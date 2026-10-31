import Link from "next/link";
import Layout from "../components/Layout";

export default function NotFound() {
  return (
    <Layout title="Not found">
      <section className="wrap section empty">
        <img src="/logo.png" alt="" width="120" height="120" />
        <h1 className="page-title">This card wandered off.</h1>
        <p>It may have sold. Plenty more on the shelves.</p>
        <div className="hero-ctas center"><Link href="/shop" className="btn">Browse the shop</Link></div>
      </section>
    </Layout>
  );
}
