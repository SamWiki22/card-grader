import Link from "next/link";
import { useState } from "react";
import Layout from "../../components/Layout";
import ProductImage from "../../components/ProductImage";
import OfferForm from "../../components/OfferForm";
import { useCart } from "../../lib/cart";
import { getProduct } from "../../lib/catalog";
import { money, GAME_LABEL, TYPE_LABEL, CONDITION_LABEL, CATEGORIES } from "../../lib/shared";

export default function ProductPage({ product }) {
  const { add, lines } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const inCart = lines.find(l => l.id === product.id)?.qty || 0;
  const room = Math.max(0, product.stock - inCart);
  const soldOut = product.stock <= 0;

  function onAdd() {
    add(product, Math.min(qty, room));
    setAdded(true);
    setQty(1);
  }

  return (
    <Layout title={product.name} description={`${product.name}${product.set ? ` — ${product.set}` : ""} for ${money(product.price)} at Bearded Bear TCG.`}>
      <section className="wrap section">
        <nav className="crumbs">
          <Link href="/shop">Shop</Link> / <Link href={`/shop?category=${product.category}`}>{CATEGORIES[product.category].label}</Link> / <Link href={`/shop?game=${product.game}`}>{GAME_LABEL[product.game]}</Link>
        </nav>
        <div className="product">
          <ProductImage product={product} className="product-hero" />
          <div className="product-info">
            <div className="card-tags">
              <span className="tag">{GAME_LABEL[product.game]}</span>
              <span className="tag tag-sealed">{TYPE_LABEL[product.type] || "Sealed"}</span>
            </div>
            <h1>{product.name}</h1>
            {product.set && <p className="product-set">{product.set}</p>}
            <div className="product-price">{money(product.price)}</div>
            <dl className="specs">
              {product.type === "single" && product.condition && <><dt>Condition</dt><dd>{CONDITION_LABEL[product.condition] || product.condition}</dd></>}
              {product.type !== "single" && <><dt>Condition</dt><dd>Factory sealed</dd></>}
              <dt>Availability</dt>
              <dd>{soldOut ? "Sold out" : product.stock <= 3 ? `Only ${product.stock} left` : "In stock"}</dd>
            </dl>
            {soldOut ? (
              <p className="notice">This one’s gone — check the <Link href={`/shop?game=${product.game}`}>{GAME_LABEL[product.game]} shelf</Link> for more.</p>
            ) : (
              <div className="buy-row">
                <div className="qty">
                  <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty(q => Math.min(room || 1, q + 1))} aria-label="Increase quantity">+</button>
                </div>
                <button className="btn" onClick={onAdd} disabled={room === 0}>{room === 0 ? "All in your cart" : "Add to cart"}</button>
              </div>
            )}
            {added && <p className="added">Added! <Link href="/cart">View cart →</Link></p>}
            {!soldOut && <OfferForm product={product} />}
          </div>
        </div>
      </section>
    </Layout>
  );
}

export async function getServerSideProps({ params, res }) {
  let product = null;
  try { product = await getProduct(params.id); } catch (e) { console.error(e); }
  if (!product || product.price <= 0) return { notFound: true };
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  return { props: { product } };
}
