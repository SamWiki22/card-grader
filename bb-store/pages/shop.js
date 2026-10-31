import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import ProductCard from "../components/ProductCard";
import { listProducts } from "../lib/catalog";
import { GAMES, CATEGORIES } from "../lib/shared";

const SORTS = [
  { id: "new", label: "Newest" },
  { id: "price-asc", label: "Price: low → high" },
  { id: "price-desc", label: "Price: high → low" },
  { id: "name", label: "Name A → Z" },
];

export default function Shop({ products, category, game, q, sort, total }) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);

  function update(changes) {
    const next = { category, game, q, sort, ...changes };
    const query = Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === "sort" && v === "new")));
    router.push({ pathname: "/shop", query }, undefined, { scroll: false });
  }

  const heading = [game && GAMES.find(g => g.id === game)?.label, category ? CATEGORIES[category].label : "All products"].filter(Boolean).join(" ");

  return (
    <Layout title={heading}>
      <section className="wrap section">
        <h1 className="page-title">{heading}</h1>
        <form className="filters" onSubmit={e => { e.preventDefault(); update({ q: search.trim() }); }}>
          <input className="input search" type="search" placeholder="Search cards, sets…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search" />
          <select className="input" value={category} onChange={e => update({ category: e.target.value })} aria-label="Category">
            <option value="">All products</option>
            {Object.entries(CATEGORIES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
          <select className="input" value={game} onChange={e => update({ game: e.target.value })} aria-label="Game">
            <option value="">All games</option>
            {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <select className="input" value={sort} onChange={e => update({ sort: e.target.value })} aria-label="Sort">
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </form>
        <p className="muted small result-count">{products.length} of {total} item{total === 1 ? "" : "s"}</p>
        {products.length ? (
          <div className="grid">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>
        ) : (
          <div className="empty">
            <img src="/logo.png" alt="" width="96" height="96" />
            <p>Nothing matches that yet. Try another search or check back soon.</p>
          </div>
        )}
      </section>
    </Layout>
  );
}

export async function getServerSideProps({ query, res }) {
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  const one = v => (Array.isArray(v) ? v[0] : v) || "";
  const category = CATEGORIES[one(query.category)] ? one(query.category) : "";
  const game = GAMES.some(g => g.id === one(query.game)) ? one(query.game) : "";
  const q = one(query.q).slice(0, 100);
  const sort = SORTS.some(s => s.id === one(query.sort)) ? one(query.sort) : "new";

  let all = [];
  try { all = await listProducts(); } catch (e) { console.error(e); }
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  let products = all.filter(p =>
    (!category || p.category === category) &&
    (!game || p.game === game) &&
    terms.every(t => `${p.name} ${p.set}`.toLowerCase().includes(t))
  );
  if (sort === "price-asc") products.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") products.sort((a, b) => b.price - a.price);
  if (sort === "name") products.sort((a, b) => a.name.localeCompare(b.name));

  return { props: { products, category, game, q, sort, total: all.length } };
}
