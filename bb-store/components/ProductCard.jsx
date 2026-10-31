import Link from "next/link";
import ProductImage from "./ProductImage";
import { useCart } from "../lib/cart";
import { money, GAME_LABEL, TYPE_LABEL } from "../lib/shared";

export default function ProductCard({ product }) {
  const { add, lines } = useCart();
  const inCart = lines.find(l => l.id === product.id)?.qty || 0;
  const maxed = inCart >= product.stock;

  return (
    <article className="card">
      <Link href={`/product/${encodeURIComponent(product.id)}`} className="card-link">
        <ProductImage product={product} />
        <div className="card-body">
          <div className="card-tags">
            <span className="tag">{GAME_LABEL[product.game]}</span>
            {product.type === "single"
              ? product.condition && <span className="tag tag-cond">{product.condition}</span>
              : <span className="tag tag-sealed">{TYPE_LABEL[product.type] || "Sealed"}</span>}
          </div>
          <h3 className="card-title">{product.name}</h3>
          {product.set && <p className="card-set">{product.set}</p>}
        </div>
      </Link>
      <div className="card-foot">
        <div>
          <div className="price">{money(product.price)}</div>
          {product.stock <= 3 && <div className="stock-low">Only {product.stock} left</div>}
        </div>
        <button className="btn btn-small" onClick={() => add(product)} disabled={maxed}>
          {maxed ? "In cart" : inCart ? `Add (${inCart})` : "Add"}
        </button>
      </div>
    </article>
  );
}
